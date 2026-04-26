import { Injectable, NotFoundException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PrismaService } from '../database/prisma.service';

// Genere un PDF "tout savoir sur ce client" pour usage hors-ligne
// (panne CRM, urgence, intervention sur site sans connexion).
// Inclus : infos generales, sites, reseaux, contacts, contrats, assets,
// assets flexibles (sans secrets), quick notes, doc pages, liste des secrets
// (libelles uniquement, pour reference). Pas de mots de passe en clair.

@Injectable()
export class EmergencyPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForCompany(companyId: string): Promise<{ buffer: Buffer; filename: string }> {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
        contracts: {
          where: { status: { in: ['ACTIVE', 'RENEWED'] } },
          orderBy: { endDate: 'asc' },
        },
        locations: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
        networks: {
          orderBy: [{ kind: 'asc' }, { name: 'asc' }],
          include: { location: { select: { name: true } } },
        },
        assets: {
          where: { status: 'ACTIVE' },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
        },
        flexibleAssets: {
          orderBy: [{ type: { name: 'asc' } }, { name: 'asc' }],
          include: {
            type: { include: { fields: { orderBy: { position: 'asc' } } } },
            location: { select: { name: true } },
          },
        },
        docPages: { orderBy: [{ category: 'asc' }, { title: 'asc' }] },
        secrets: { orderBy: { label: 'asc' } },
        quickNotes: { orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] },
      },
    });
    if (!c) throw new NotFoundException('Societe introuvable');

    const buffer = await this.build(c);
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = 'urgence_' + slug + '_' + format(new Date(), 'yyyy-MM-dd') + '.pdf';
    return { buffer, filename };
  }

  private async build(c: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (b: Buffer) => chunks.push(b));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.coverPage(doc, c);

        if (c.locations.length > 0) {
          this.section(doc, 'Sites (' + c.locations.length + ')');
          for (const l of c.locations) {
            doc.fontSize(11).fillColor('#000').text(l.name + (l.isPrimary ? ' (principal)' : ''), { underline: false });
            doc.fontSize(9).fillColor('#444');
            const addr = [l.address, l.postalCode, l.city, l.country].filter(Boolean).join(' ');
            if (addr) doc.text(addr);
            if (l.phone) doc.text('Tel : ' + l.phone);
            if (l.notes) doc.text('Notes : ' + l.notes);
            doc.moveDown(0.5);
          }
        }

        if (c.contacts.length > 0) {
          this.section(doc, 'Contacts (' + c.contacts.length + ')');
          for (const ct of c.contacts) {
            doc.fontSize(11).fillColor('#000').text(
              ct.firstName + ' ' + ct.lastName + (ct.isPrimary ? ' (principal)' : '') + (ct.position ? ' - ' + ct.position : ''),
            );
            doc.fontSize(9).fillColor('#444');
            const lines = [ct.email, ct.phone, ct.mobile].filter(Boolean);
            if (lines.length) doc.text(lines.join(' / '));
            doc.moveDown(0.3);
          }
        }

        if (c.contracts.length > 0) {
          this.section(doc, 'Contrats actifs (' + c.contracts.length + ')');
          for (const k of c.contracts) {
            doc.fontSize(11).fillColor('#000').text(k.reference + ' - ' + k.title);
            doc.fontSize(9).fillColor('#444').text(
              k.offer + ' / ' + Number(k.monthlyAmountHt).toFixed(2) +
              ' EUR HT mensuel / ' +
              format(k.startDate, 'P', { locale: fr }) + ' -> ' +
              format(k.endDate, 'P', { locale: fr }),
            );
            doc.moveDown(0.3);
          }
        }

        if (c.networks.length > 0) {
          this.section(doc, 'Reseaux (' + c.networks.length + ')');
          for (const n of c.networks) {
            doc.fontSize(11).fillColor('#000').text(
              '[' + n.kind + '] ' + n.name + (n.location ? ' @ ' + n.location.name : ''),
            );
            doc.fontSize(9).fillColor('#444');
            const parts: string[] = [];
            if (n.cidr) parts.push('CIDR : ' + n.cidr);
            if (n.vlanId !== null && n.vlanId !== undefined) parts.push('VLAN : ' + n.vlanId);
            if (n.gateway) parts.push('GW : ' + n.gateway);
            if (n.dnsServers) parts.push('DNS : ' + n.dnsServers);
            if (parts.length) doc.text(parts.join('  |  '));
            if (n.dhcpStart || n.dhcpEnd) doc.text('DHCP : ' + (n.dhcpStart ?? '?') + ' -> ' + (n.dhcpEnd ?? '?'));
            if (n.description) doc.text(n.description);
            doc.moveDown(0.3);
          }
        }

        if (c.assets.length > 0) {
          this.section(doc, 'Assets (' + c.assets.length + ')');
          for (const a of c.assets) {
            const exp = a.expiresAt ? ' / expire ' + format(a.expiresAt, 'P', { locale: fr }) : '';
            doc.fontSize(11).fillColor('#000').text(
              '[' + a.type + '] ' + a.name + (a.identifier ? ' - ' + a.identifier : '') + exp,
            );
            doc.fontSize(9).fillColor('#444');
            const meta: string[] = [];
            if (a.vendor) meta.push(a.vendor);
            if (a.model) meta.push(a.model);
            if (meta.length) doc.text(meta.join(' / '));
            if (a.notes) doc.text(a.notes);
            doc.moveDown(0.3);
          }
        }

        if (c.flexibleAssets.length > 0) {
          this.section(doc, 'Assets flexibles (' + c.flexibleAssets.length + ')');
          for (const fa of c.flexibleAssets) {
            doc.fontSize(11).fillColor('#000').text(
              '[' + fa.type.name + '] ' + fa.name + (fa.location ? ' @ ' + fa.location.name : ''),
            );
            doc.fontSize(9).fillColor('#444');
            const values = (fa.values ?? {}) as Record<string, unknown>;
            for (const f of fa.type.fields) {
              if (f.fieldType === 'PASSWORD') {
                // Ne JAMAIS exposer un mot de passe dans le PDF.
                // On indique juste si une valeur est definie.
                const hasSecret = (fa.secretValues ?? {})[f.key];
                doc.text('  - ' + f.label + ' : ' + (hasSecret ? '<chiffre - voir CRM>' : '-'));
              } else {
                const v = values[f.key];
                if (v !== undefined && v !== null && v !== '') {
                  doc.text('  - ' + f.label + ' : ' + String(v));
                }
              }
            }
            doc.moveDown(0.3);
          }
        }

        if (c.quickNotes.length > 0) {
          this.section(doc, 'Quick notes (' + c.quickNotes.length + ')');
          for (const q of c.quickNotes) {
            doc.fontSize(10).fillColor('#000').text((q.pinned ? '* ' : '') + q.content);
            doc.moveDown(0.2);
          }
        }

        if (c.docPages.length > 0) {
          for (const d of c.docPages) {
            this.section(doc, 'Doc : ' + d.title + (d.category ? ' (' + d.category + ')' : ''));
            doc.fontSize(9).fillColor('#222').text(d.body, { align: 'left' });
          }
        }

        if (c.secrets.length > 0) {
          this.section(doc, 'Coffre a secrets (' + c.secrets.length + ' references)');
          doc.fontSize(8).fillColor('#888').text(
            'Pour des raisons de securite, les valeurs ne sont JAMAIS imprimees. Seuls les libelles sont exposes pour reference. Les valeurs sont disponibles dans le CRM (audit trace).',
            { align: 'left' },
          );
          doc.moveDown(0.3);
          for (const s of c.secrets) {
            doc.fontSize(10).fillColor('#000').text('- ' + s.label + (s.username ? ' (' + s.username + ')' : '') + (s.url ? ' - ' + s.url : ''));
          }
        }

        // Footer toutes pages
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(7).fillColor('#888').text(
            'CONFIDENTIEL - ' + c.name + ' - genere le ' + format(new Date(), 'PPP', { locale: fr }) +
            ' - page ' + (i + 1) + '/' + range.count,
            40, 810, { align: 'center', width: 515 },
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private coverPage(doc: any, c: any) {
    doc.fontSize(8).fillColor('#dc2626').text('CONFIDENTIEL', { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(24).fillColor('#1d4ed8').text('Dossier d\'urgence', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(20).fillColor('#000').text(c.name, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(10).fillColor('#444');
    if (c.siret) doc.text('SIRET : ' + c.siret);
    if (c.siren) doc.text('SIREN : ' + c.siren);
    if (c.legalForm) doc.text('Forme juridique : ' + c.legalForm);
    if (c.email) doc.text('Email : ' + c.email);
    if (c.phone) doc.text('Telephone : ' + c.phone);
    if (c.website) doc.text('Web : ' + c.website);
    const fullAddr = [c.address, c.postalCode, c.city, c.country].filter(Boolean).join(' ');
    if (fullAddr) doc.text('Adresse : ' + fullAddr);

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text(
      'Document genere le ' + format(new Date(), 'PPPp', { locale: fr }),
      { align: 'center' },
    );
    doc.moveDown(0.5);
    doc.fontSize(8).text(
      'Ce document contient des informations confidentielles. ' +
      'Les mots de passe et secrets ne sont jamais imprimes ; ils restent dans le coffre du CRM ' +
      'avec audit d\'acces (NIS2/RGPD).',
      { align: 'center' },
    );
  }

  private section(doc: any, title: string) {
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.6);
    doc.fontSize(13).fillColor('#1d4ed8').text(title);
    doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).strokeColor('#1d4ed8').stroke();
    doc.moveDown(0.4);
  }
}
