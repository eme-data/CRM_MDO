import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const COMPANY_NAME = 'MDO Services';
const COMPANY_LINE = 'Prestataire IT et Cybersecurite - Occitanie';
const COMPANY_CONTACT = 'mathieu@mdoservices.fr - https://www.mdoservices.fr';

interface InvoiceParams {
  reference: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  client: { name: string; address?: string; postalCode?: string; city?: string; siret?: string };
  lines: Array<{ description: string; quantity: number; unitPriceHt: number }>;
  vatRate: number;
}

interface ContractPdfParams {
  contract: {
    reference: string;
    title: string;
    offer: string;
    startDate: Date;
    endDate: Date;
    engagementMonths: number;
    unitPriceHt: number;
    quantity: number;
    monthlyAmountHt: number;
    vatRate: number;
    description?: string | null;
  };
  client: { name: string; address?: string; postalCode?: string; city?: string; siret?: string };
}

interface QuotePdfParams {
  quote: {
    reference: string;
    title: string;
    issueDate: Date;
    validUntil: Date;
    vatRate: number;
    notes?: string | null;
    terms?: string | null;
    subtotalHt: number;
    vatAmount: number;
    totalTtc: number;
    lines: Array<{
      description: string;
      quantity: number;
      unitPriceHt: number;
      discountPct: number;
      lineTotalHt: number;
    }>;
  };
  client: { name: string; address?: string; postalCode?: string; city?: string; siret?: string };
}

interface InterventionPdfParams {
  intervention: {
    title: string;
    type: string;
    scheduledAt: Date;
    startedAt?: Date | null;
    endedAt?: Date | null;
    durationMin?: number | null;
    description?: string | null;
    report?: string | null;
  };
  client: { name: string; address?: string; postalCode?: string; city?: string };
  technician?: { firstName: string; lastName: string };
}

export interface MonthlyReportData {
  company: { name: string; address?: string | null; postalCode?: string | null; city?: string | null };
  periodStart: Date;
  periodEnd: Date;
  tickets: {
    total: number;
    resolved: number;
    avgResolutionHours: number | null;
    slaRespected: number; // count
    slaTotal: number; // count avec SLA defini
    byCategory: Array<{ category: string; count: number }>;
  };
  interventions: {
    total: number;
    totalDurationMin: number;
    list: Array<{ scheduledAt: Date; title: string; type: string; durationMin: number | null }>;
  };
  surveillance: {
    monitoredCount: number;
    expiredCount: number;
    expiringIn30: number;
    alertsSent: number;
    items: Array<{ name: string; type: string; expiresAt: Date | null; daysRemaining: number | null }>;
  };
  uptime: {
    monitors: number;
    avgUptimePct: number | null;
    incidents: number; // nombre de bascules UP→DOWN sur la periode
    list: Array<{ name: string; url: string; uptimePct: number | null; incidents: number }>;
  };
  inventory: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    list: Array<{ name: string; type: string; identifier: string | null; status: string; expiresAt: Date | null }>;
  };
  // Section Cyber/Posture optionnelle (omise dans le PDF si null — rapports
  // d'avant la refonte Cyber n'avaient pas ce bloc).
  posture?: {
    cyberScore: number | null;       // 0-100
    healthScore: number | null;      // 0-100
    healthRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    healthAlerts: string[];          // 0-5 raisons cles
    compliance: Array<{
      framework: string;             // 'NIS2' | 'ISO27001' | ...
      scorePct: number;
      compliantCount: number;
      totalControls: number;
      nonCompliantCount: number;
    }>;
  };
}

@Injectable()
export class PdfService {
  // ============ Generation generique d'un PDF en buffer ============
  private async toBuffer(builder: (doc: any) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        builder(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ============ FACTURE ============
  async invoice(params: InvoiceParams): Promise<Buffer> {
    return this.toBuffer((doc) => {
      this.header(doc, 'FACTURE');
      this.companyHeader(doc);

      doc.moveDown(2);
      const top = doc.y;
      // Bloc client a droite
      doc.fontSize(10).fillColor('#000').text('Client :', 350, top);
      doc.fontSize(11).text(params.client.name, 350, top + 15);
      let y = top + 30;
      if (params.client.address) { doc.fontSize(10).text(params.client.address, 350, y); y += 12; }
      if (params.client.postalCode || params.client.city) {
        doc.text((params.client.postalCode ?? '') + ' ' + (params.client.city ?? ''), 350, y);
        y += 12;
      }
      if (params.client.siret) doc.text('SIRET : ' + params.client.siret, 350, y);

      // Numero + dates a gauche
      doc.fontSize(11).fillColor('#000');
      doc.text('Facture n. ' + params.number, 50, top);
      doc.fontSize(10).text('Reference : ' + params.reference, 50, top + 15);
      doc.text('Emise le : ' + format(params.issueDate, 'PPP', { locale: fr }), 50, top + 30);
      doc.text('Echeance : ' + format(params.dueDate, 'PPP', { locale: fr }), 50, top + 45);

      doc.moveDown(6);

      // Tableau des lignes
      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#1d4ed8');
      doc.text('Description', 50, tableTop);
      doc.text('Qte', 350, tableTop, { width: 50, align: 'right' });
      doc.text('PU HT', 400, tableTop, { width: 60, align: 'right' });
      doc.text('Total HT', 470, tableTop, { width: 80, align: 'right' });
      doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).strokeColor('#1d4ed8').stroke();
      doc.fillColor('#000');

      let yLine = tableTop + 22;
      let totalHt = 0;
      for (const line of params.lines) {
        const lineTotal = line.quantity * line.unitPriceHt;
        totalHt += lineTotal;
        doc.fontSize(10);
        doc.text(line.description, 50, yLine, { width: 290 });
        doc.text(String(line.quantity), 350, yLine, { width: 50, align: 'right' });
        doc.text(line.unitPriceHt.toFixed(2) + ' EUR', 400, yLine, { width: 60, align: 'right' });
        doc.text(lineTotal.toFixed(2) + ' EUR', 470, yLine, { width: 80, align: 'right' });
        const h = doc.heightOfString(line.description, { width: 290 });
        yLine += Math.max(h, 14) + 4;
      }

      doc.moveTo(350, yLine + 4).lineTo(550, yLine + 4).strokeColor('#000').stroke();
      const vat = totalHt * (params.vatRate / 100);
      const totalTtc = totalHt + vat;
      yLine += 12;
      doc.fontSize(10);
      doc.text('Total HT', 350, yLine, { width: 120, align: 'right' });
      doc.text(totalHt.toFixed(2) + ' EUR', 470, yLine, { width: 80, align: 'right' });
      yLine += 14;
      doc.text('TVA (' + params.vatRate + ' %)', 350, yLine, { width: 120, align: 'right' });
      doc.text(vat.toFixed(2) + ' EUR', 470, yLine, { width: 80, align: 'right' });
      yLine += 14;
      doc.fontSize(12).fillColor('#1d4ed8');
      doc.text('Total TTC', 350, yLine, { width: 120, align: 'right' });
      doc.text(totalTtc.toFixed(2) + ' EUR', 470, yLine, { width: 80, align: 'right' });

      this.footer(doc);
    });
  }

  // ============ DEVIS ============
  async quote(params: QuotePdfParams): Promise<Buffer> {
    return this.toBuffer((doc) => {
      this.header(doc, 'DEVIS');
      this.companyHeader(doc);

      doc.moveDown(2);
      const top = doc.y;

      // Bloc client a droite
      doc.fontSize(10).fillColor('#000').text('Client :', 350, top);
      doc.fontSize(11).text(params.client.name, 350, top + 15);
      let y = top + 30;
      if (params.client.address) {
        doc.fontSize(10).text(params.client.address, 350, y);
        y += 12;
      }
      if (params.client.postalCode || params.client.city) {
        doc.text((params.client.postalCode ?? '') + ' ' + (params.client.city ?? ''), 350, y);
        y += 12;
      }
      if (params.client.siret) doc.text('SIRET : ' + params.client.siret, 350, y);

      // Reference + dates a gauche
      doc.fontSize(11).fillColor('#000');
      doc.text('Devis ' + params.quote.reference, 50, top);
      doc.fontSize(10).text('Objet : ' + params.quote.title, 50, top + 15, { width: 290 });
      doc.text('Emis le : ' + format(params.quote.issueDate, 'PPP', { locale: fr }), 50, top + 45);
      doc.text('Valable jusqu\'au : ' + format(params.quote.validUntil, 'PPP', { locale: fr }), 50, top + 60);

      doc.moveDown(7);

      // Tableau des lignes
      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#1d4ed8');
      doc.text('Description', 50, tableTop);
      doc.text('Qte', 290, tableTop, { width: 40, align: 'right' });
      doc.text('PU HT', 335, tableTop, { width: 60, align: 'right' });
      doc.text('Remise', 400, tableTop, { width: 50, align: 'right' });
      doc.text('Total HT', 455, tableTop, { width: 95, align: 'right' });
      doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).strokeColor('#1d4ed8').stroke();
      doc.fillColor('#000');

      let yLine = tableTop + 22;
      for (const line of params.quote.lines) {
        this.ensureSpace(doc, 24);
        doc.fontSize(10);
        doc.text(line.description, 50, yLine, { width: 235 });
        doc.text(String(line.quantity), 290, yLine, { width: 40, align: 'right' });
        doc.text(line.unitPriceHt.toFixed(2) + ' EUR', 335, yLine, { width: 60, align: 'right' });
        doc.text(line.discountPct > 0 ? line.discountPct.toFixed(0) + ' %' : '-', 400, yLine, { width: 50, align: 'right' });
        doc.text(line.lineTotalHt.toFixed(2) + ' EUR', 455, yLine, { width: 95, align: 'right' });
        const h = doc.heightOfString(line.description, { width: 235 });
        yLine += Math.max(h, 14) + 4;
      }

      doc.moveTo(290, yLine + 4).lineTo(550, yLine + 4).strokeColor('#000').stroke();
      yLine += 12;
      doc.fontSize(10);
      doc.text('Sous-total HT', 290, yLine, { width: 160, align: 'right' });
      doc.text(params.quote.subtotalHt.toFixed(2) + ' EUR', 455, yLine, { width: 95, align: 'right' });
      yLine += 14;
      doc.text('TVA (' + params.quote.vatRate + ' %)', 290, yLine, { width: 160, align: 'right' });
      doc.text(params.quote.vatAmount.toFixed(2) + ' EUR', 455, yLine, { width: 95, align: 'right' });
      yLine += 14;
      doc.fontSize(12).fillColor('#1d4ed8');
      doc.text('Total TTC', 290, yLine, { width: 160, align: 'right' });
      doc.text(params.quote.totalTtc.toFixed(2) + ' EUR', 455, yLine, { width: 95, align: 'right' });
      doc.y = yLine + 24;
      doc.fillColor('#000');

      if (params.quote.notes) {
        doc.moveDown();
        doc.fontSize(10).fillColor('#1d4ed8').text('Notes');
        doc.fontSize(10).fillColor('#000').text(params.quote.notes, { align: 'justify' });
      }

      if (params.quote.terms) {
        doc.moveDown();
        doc.fontSize(10).fillColor('#1d4ed8').text('Conditions');
        doc.fontSize(9).fillColor('#000').text(params.quote.terms, { align: 'justify' });
      }

      doc.moveDown(2);
      doc.fontSize(10).fillColor('#666').text(
        'Bon pour accord — Date et signature du client',
        { underline: true },
      );
      doc.moveDown(4);
      this.footer(doc);
    });
  }

  // ============ CONTRAT ============
  async contract(params: ContractPdfParams): Promise<Buffer> {
    return this.toBuffer((doc) => {
      this.header(doc, 'CONTRAT DE PRESTATION');
      this.companyHeader(doc);

      doc.moveDown(2);
      doc.fontSize(11).fillColor('#000');
      doc.text('Reference : ' + params.contract.reference);
      doc.text('Titre : ' + params.contract.title);
      doc.moveDown();
      doc.fontSize(13).fillColor('#1d4ed8').text('Client');
      doc.fontSize(11).fillColor('#000');
      doc.text(params.client.name);
      if (params.client.address) doc.text(params.client.address);
      if (params.client.postalCode || params.client.city) {
        doc.text((params.client.postalCode ?? '') + ' ' + (params.client.city ?? ''));
      }
      if (params.client.siret) doc.text('SIRET : ' + params.client.siret);

      doc.moveDown();
      doc.fontSize(13).fillColor('#1d4ed8').text('Conditions');
      doc.fontSize(11).fillColor('#000');
      doc.text('Offre : ' + params.contract.offer);
      doc.text('Date de debut : ' + format(params.contract.startDate, 'PPP', { locale: fr }));
      doc.text('Date de fin : ' + format(params.contract.endDate, 'PPP', { locale: fr }));
      doc.text('Duree d\'engagement : ' + params.contract.engagementMonths + ' mois');

      doc.moveDown();
      doc.fontSize(13).fillColor('#1d4ed8').text('Tarification');
      doc.fontSize(11).fillColor('#000');
      doc.text('Prix unitaire HT : ' + params.contract.unitPriceHt.toFixed(2) + ' EUR / utilisateur / mois');
      doc.text('Quantite : ' + params.contract.quantity + ' utilisateur(s)');
      doc.text('Montant mensuel HT : ' + params.contract.monthlyAmountHt.toFixed(2) + ' EUR');
      const ttc = params.contract.monthlyAmountHt * (1 + params.contract.vatRate / 100);
      doc.text('Montant mensuel TTC estime : ' + ttc.toFixed(2) + ' EUR (TVA ' + params.contract.vatRate + ' %)');

      if (params.contract.description) {
        doc.moveDown();
        doc.fontSize(13).fillColor('#1d4ed8').text('Description');
        doc.fontSize(10).fillColor('#000').text(params.contract.description, { align: 'justify' });
      }

      doc.moveDown(2);
      doc.fontSize(10).fillColor('#666').text(
        'Signature et cachet du client',
        { underline: true },
      );
      doc.moveDown(4);
      this.footer(doc);
    });
  }

  // ============ RAPPORT D'INTERVENTION ============
  async interventionReport(params: InterventionPdfParams): Promise<Buffer> {
    return this.toBuffer((doc) => {
      this.header(doc, 'RAPPORT D\'INTERVENTION');
      this.companyHeader(doc);

      doc.moveDown(2);
      doc.fontSize(11).fillColor('#000');
      doc.text('Titre : ' + params.intervention.title);
      doc.text('Type : ' + params.intervention.type);
      doc.text('Date prevue : ' + format(params.intervention.scheduledAt, 'PPPp', { locale: fr }));
      if (params.intervention.startedAt) {
        doc.text('Debut effectif : ' + format(params.intervention.startedAt, 'PPPp', { locale: fr }));
      }
      if (params.intervention.endedAt) {
        doc.text('Fin : ' + format(params.intervention.endedAt, 'PPPp', { locale: fr }));
      }
      if (params.intervention.durationMin != null) {
        const h = Math.floor(params.intervention.durationMin / 60);
        const m = params.intervention.durationMin % 60;
        doc.text('Duree : ' + h + 'h' + String(m).padStart(2, '0'));
      }
      if (params.technician) {
        doc.text('Technicien : ' + params.technician.firstName + ' ' + params.technician.lastName);
      }

      doc.moveDown();
      doc.fontSize(13).fillColor('#1d4ed8').text('Client');
      doc.fontSize(11).fillColor('#000').text(params.client.name);
      if (params.client.address) doc.text(params.client.address);
      if (params.client.postalCode || params.client.city) {
        doc.text((params.client.postalCode ?? '') + ' ' + (params.client.city ?? ''));
      }

      if (params.intervention.description) {
        doc.moveDown();
        doc.fontSize(13).fillColor('#1d4ed8').text('Demande');
        doc.fontSize(10).fillColor('#000').text(params.intervention.description, { align: 'justify' });
      }

      if (params.intervention.report) {
        doc.moveDown();
        doc.fontSize(13).fillColor('#1d4ed8').text('Compte-rendu');
        doc.fontSize(10).fillColor('#000').text(params.intervention.report, { align: 'justify' });
      }

      doc.moveDown(2);
      doc.fontSize(10).fillColor('#666').text(
        'Signature client',
        { underline: true },
      );
      doc.moveDown(3);
      doc.text('Signature technicien', { underline: true });
      doc.moveDown(3);
      this.footer(doc);
    });
  }

  // ============ RAPPORT MENSUEL CLIENT ============
  // Synthese de l'activite MDO pour un client sur un mois : tickets resolus,
  // interventions, surveillance certificats/domaines, uptime, inventaire.
  // C'est le document que recoit le client a chaque debut de mois.
  async monthlyClientReport(data: MonthlyReportData): Promise<Buffer> {
    return this.toBuffer((doc) => {
      const monthLabel = format(data.periodStart, 'MMMM yyyy', { locale: fr });
      this.header(doc, 'RAPPORT MENSUEL');
      this.companyHeader(doc);

      // Sous-titre periode + client
      doc.moveDown(2);
      doc.fontSize(16).fillColor('#1d4ed8').text(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1));
      doc.fontSize(11).fillColor('#666').text(
        'Du ' + format(data.periodStart, 'PPP', { locale: fr }) +
        ' au ' + format(data.periodEnd, 'PPP', { locale: fr }),
      );
      doc.moveDown();
      doc.fontSize(13).fillColor('#000').text('Client : ' + data.company.name);
      if (data.company.address) doc.fontSize(10).fillColor('#666').text(data.company.address);
      if (data.company.postalCode || data.company.city) {
        doc.fontSize(10).fillColor('#666').text((data.company.postalCode ?? '') + ' ' + (data.company.city ?? ''));
      }

      // ===== Synthese chiffree (KPIs) =====
      doc.moveDown(1.5);
      this.sectionTitle(doc, 'Synthese du mois');
      const kpiY = doc.y + 4;
      this.kpiBox(doc, 50, kpiY, 'Tickets resolus', String(data.tickets.resolved), '/ ' + data.tickets.total + ' au total');
      this.kpiBox(doc, 180, kpiY, 'Interventions', String(data.interventions.total), this.fmtDuration(data.interventions.totalDurationMin));
      this.kpiBox(doc, 310, kpiY, 'Uptime moyen', data.uptime.avgUptimePct !== null ? data.uptime.avgUptimePct.toFixed(2) + ' %' : 'N/A', data.uptime.monitors + ' site(s)');
      this.kpiBox(doc, 440, kpiY, 'Alertes envoyees', String(data.surveillance.alertsSent), data.surveillance.monitoredCount + ' actifs');
      doc.y = kpiY + 60;

      // ===== Posture cyber & sante client (optionnel) =====
      // Ce bloc remplace le rapport "purement operationnel" par un rapport
      // qui aide aussi le client a comprendre sa posture globale et le travail
      // de fond MDO sur la cyber/conformite.
      if (data.posture) {
        doc.moveDown();
        this.sectionTitle(doc, 'Posture cyber et sante du compte');
        const pY = doc.y + 4;
        const cyberLabel = data.posture.cyberScore !== null ? data.posture.cyberScore + ' / 100' : 'N/A';
        const healthLabel = data.posture.healthScore !== null ? data.posture.healthScore + ' / 100' : 'N/A';
        const healthRisk = data.posture.healthRisk ?? '';
        this.kpiBox(doc, 50, pY, 'Cyber score', cyberLabel, 'posture cybersecurite');
        this.kpiBox(doc, 180, pY, 'Health score', healthLabel, healthRisk ? 'risque ' + healthRisk : 'engagement');
        this.kpiBox(doc, 310, pY, 'Audits compliance', String(data.posture.compliance.length), data.posture.compliance.map((c) => c.framework).join(' · ') || 'aucun');
        const totalEcarts = data.posture.compliance.reduce((s, c) => s + c.nonCompliantCount, 0);
        this.kpiBox(doc, 440, pY, 'Ecarts compliance', String(totalEcarts), 'a corriger');
        doc.y = pY + 60;

        if (data.posture.compliance.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(10).fillColor('#1d4ed8').text('Detail des audits :');
          for (const c of data.posture.compliance) {
            doc.fontSize(10).fillColor('#000').text(
              '  - ' + c.framework + ' : ' + c.scorePct + ' % (' + c.compliantCount + '/' + c.totalControls + ' controles conformes, ' + c.nonCompliantCount + ' ecarts)',
            );
          }
        }
        if (data.posture.healthAlerts.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(10).fillColor('#b45309').text('Points d\'attention :');
          for (const a of data.posture.healthAlerts.slice(0, 5)) {
            doc.fontSize(9).fillColor('#000').text('  - ' + a);
          }
        }
      }

      // ===== Tickets =====
      doc.moveDown();
      this.sectionTitle(doc, 'Support : tickets traites');
      doc.fontSize(10).fillColor('#000');
      doc.text('Tickets resolus dans le mois : ' + data.tickets.resolved + ' / ' + data.tickets.total);
      if (data.tickets.avgResolutionHours !== null) {
        doc.text('Temps moyen de resolution : ' + data.tickets.avgResolutionHours.toFixed(1) + ' h');
      }
      if (data.tickets.slaTotal > 0) {
        const slaPct = (data.tickets.slaRespected / data.tickets.slaTotal) * 100;
        doc.text('SLA respecte : ' + data.tickets.slaRespected + ' / ' + data.tickets.slaTotal + ' (' + slaPct.toFixed(0) + ' %)');
      }
      if (data.tickets.byCategory.length > 0) {
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#666').text('Repartition par categorie :');
        for (const c of data.tickets.byCategory) {
          doc.fontSize(10).fillColor('#000').text('  - ' + c.category + ' : ' + c.count);
        }
      }

      // ===== Interventions =====
      doc.moveDown();
      this.sectionTitle(doc, 'Interventions sur site / a distance');
      if (data.interventions.list.length === 0) {
        doc.fontSize(10).fillColor('#666').text('Aucune intervention sur la periode.');
      } else {
        this.tableHeader(doc, ['Date', 'Titre', 'Type', 'Duree'], [70, 220, 90, 70]);
        for (const it of data.interventions.list) {
          this.ensureSpace(doc, 18);
          this.tableRow(doc, [
            format(it.scheduledAt, 'dd/MM/yyyy', { locale: fr }),
            it.title.length > 45 ? it.title.slice(0, 42) + '...' : it.title,
            it.type,
            it.durationMin ? this.fmtDuration(it.durationMin) : '-',
          ], [70, 220, 90, 70]);
        }
      }

      // ===== Surveillance certificats / domaines =====
      doc.moveDown();
      this.sectionTitle(doc, 'Surveillance certificats et domaines');
      doc.fontSize(10).fillColor('#000');
      doc.text('Elements surveilles : ' + data.surveillance.monitoredCount);
      doc.text('Expires ou bientot : ' + (data.surveillance.expiredCount + data.surveillance.expiringIn30));
      doc.text('Alertes envoyees ce mois : ' + data.surveillance.alertsSent);
      if (data.surveillance.items.length > 0) {
        doc.moveDown(0.3);
        this.tableHeader(doc, ['Nom', 'Type', 'Expire le', 'Restant'], [200, 80, 90, 70]);
        for (const s of data.surveillance.items) {
          this.ensureSpace(doc, 18);
          this.tableRow(doc, [
            s.name.length > 38 ? s.name.slice(0, 35) + '...' : s.name,
            s.type,
            s.expiresAt ? format(s.expiresAt, 'dd/MM/yyyy', { locale: fr }) : '-',
            s.daysRemaining !== null ? s.daysRemaining + ' j' : '-',
          ], [200, 80, 90, 70]);
        }
      }

      // ===== Uptime =====
      doc.moveDown();
      this.sectionTitle(doc, 'Disponibilite des sites');
      if (data.uptime.monitors === 0) {
        doc.fontSize(10).fillColor('#666').text('Aucun site surveille.');
      } else {
        this.tableHeader(doc, ['Site', 'URL', 'Uptime', 'Incidents'], [120, 220, 70, 70]);
        for (const u of data.uptime.list) {
          this.ensureSpace(doc, 18);
          this.tableRow(doc, [
            u.name.length > 22 ? u.name.slice(0, 19) + '...' : u.name,
            u.url.length > 40 ? u.url.slice(0, 37) + '...' : u.url,
            u.uptimePct !== null ? u.uptimePct.toFixed(2) + ' %' : 'N/A',
            String(u.incidents),
          ], [120, 220, 70, 70]);
        }
      }

      // ===== Inventaire =====
      doc.moveDown();
      this.sectionTitle(doc, 'Inventaire des assets actifs');
      doc.fontSize(10).fillColor('#000').text('Total : ' + data.inventory.total + ' element(s)');
      if (data.inventory.byType.length > 0) {
        for (const t of data.inventory.byType) {
          doc.fontSize(10).fillColor('#000').text('  - ' + t.type + ' : ' + t.count);
        }
      }
      if (data.inventory.list.length > 0) {
        doc.moveDown(0.3);
        this.tableHeader(doc, ['Nom', 'Type', 'Identifiant', 'Statut'], [160, 90, 180, 70]);
        for (const a of data.inventory.list) {
          this.ensureSpace(doc, 18);
          this.tableRow(doc, [
            a.name.length > 30 ? a.name.slice(0, 27) + '...' : a.name,
            a.type,
            a.identifier ? (a.identifier.length > 32 ? a.identifier.slice(0, 29) + '...' : a.identifier) : '-',
            a.status,
          ], [160, 90, 180, 70]);
        }
      }

      this.footer(doc);
    });
  }

  private fmtDuration(min: number): string {
    if (!min) return '0h00';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h + 'h' + String(m).padStart(2, '0');
  }

  private sectionTitle(doc: any, title: string) {
    doc.fontSize(13).fillColor('#1d4ed8').text(title);
    doc.moveTo(50, doc.y + 2).lineTo(550, doc.y + 2).strokeColor('#dbeafe').stroke();
    doc.moveDown(0.4);
  }

  private kpiBox(doc: any, x: number, y: number, label: string, value: string, sub: string) {
    doc.roundedRect(x, y, 120, 50, 4).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fontSize(8).fillColor('#64748b').text(label, x + 8, y + 8, { width: 104 });
    doc.fontSize(16).fillColor('#1d4ed8').text(value, x + 8, y + 20, { width: 104 });
    doc.fontSize(8).fillColor('#94a3b8').text(sub, x + 8, y + 40, { width: 104 });
  }

  private tableHeader(doc: any, cols: string[], widths: number[]) {
    const y = doc.y;
    let x = 50;
    doc.fontSize(9).fillColor('#1d4ed8');
    for (let i = 0; i < cols.length; i++) {
      doc.text(cols[i], x, y, { width: widths[i] });
      x += widths[i];
    }
    doc.moveTo(50, y + 12).lineTo(550, y + 12).strokeColor('#cbd5e1').stroke();
    doc.y = y + 16;
    doc.fillColor('#000');
  }

  private tableRow(doc: any, cols: string[], widths: number[]) {
    const y = doc.y;
    let x = 50;
    doc.fontSize(9).fillColor('#000');
    for (let i = 0; i < cols.length; i++) {
      doc.text(cols[i], x, y, { width: widths[i] });
      x += widths[i];
    }
    doc.y = y + 14;
  }

  private ensureSpace(doc: any, needed: number) {
    if (doc.y + needed > 760) doc.addPage();
  }

  // ============ Helpers ============
  private header(doc: any, title: string) {
    doc.fontSize(20).fillColor('#1d4ed8').text(title, 50, 50);
    doc.moveTo(50, 80).lineTo(550, 80).strokeColor('#1d4ed8').stroke();
  }

  private companyHeader(doc: any) {
    doc.fontSize(12).fillColor('#000').text(COMPANY_NAME, 50, 90);
    doc.fontSize(9).fillColor('#666').text(COMPANY_LINE, 50, 106);
    doc.text(COMPANY_CONTACT, 50, 118);
  }

  private footer(doc: any) {
    const range = doc.bufferedPageRange?.() ?? { start: 0, count: 1 };
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage?.(i);
      doc.fontSize(8).fillColor('#999').text(
        COMPANY_NAME + ' - Document genere le ' + format(new Date(), 'PPP', { locale: fr }),
        50,
        780,
        { align: 'center', width: 500 },
      );
    }
  }
}
