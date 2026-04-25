import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
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
