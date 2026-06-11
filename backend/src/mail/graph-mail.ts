// Helper pur d'envoi de mail via Microsoft Graph (OAuth2 app-only /
// client_credentials). Reutilise par MailService (envoi transactionnel) et par
// SettingsController (bouton "Tester"). Aucune dependance Nest -> pas de
// couplage de modules ni de DI circulaire.
//
// Prerequis cote Entra : l'app (clientId/secret) doit avoir la permission
// APPLICATION Mail.Send + admin-consent. Recommande : restreindre l'app a la
// seule boite expeditrice via une Application Access Policy Exchange Online.
//
// Doc : https://learn.microsoft.com/en-us/graph/api/user-sendmail

export interface GraphMailConfig {
  clientId: string;
  clientSecret: string;
  azureTenantId: string;
  sender: string; // UPN / adresse de la boite expeditrice (ex: no-reply@mdoservices.fr)
}

export interface GraphMailMessage {
  subject: string;
  html: string;
  to: string; // adresses separees par virgule
  cc?: string;
  bcc?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

function recipients(csv: string): Array<{ emailAddress: { address: string } }> {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

export async function getGraphAppToken(cfg: GraphMailConfig): Promise<string> {
  const res = await fetch(
    'https://login.microsoftonline.com/' + cfg.azureTenantId + '/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const data: any = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      'Graph token error (' + res.status + ') : ' +
      (data.error_description ?? data.error ?? 'unknown'),
    );
  }
  return data.access_token as string;
}

export async function sendGraphMail(cfg: GraphMailConfig, msg: GraphMailMessage): Promise<void> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.azureTenantId || !cfg.sender) {
    throw new Error(
      'Transport Graph mal configure (requis : m365.clientId, m365.clientSecret, mail.graphTenantId, mail.graphSender)',
    );
  }

  const token = await getGraphAppToken(cfg);

  const attachments = msg.attachments?.map((a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.filename,
    contentType: a.contentType ?? 'application/octet-stream',
    contentBytes: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString('base64'),
  }));

  const message: any = {
    subject: msg.subject,
    body: { contentType: 'HTML', content: msg.html },
    toRecipients: recipients(msg.to),
  };
  if (msg.cc) message.ccRecipients = recipients(msg.cc);
  if (msg.bcc) message.bccRecipients = recipients(msg.bcc);
  if (msg.replyTo) message.replyTo = recipients(msg.replyTo);
  if (attachments && attachments.length) message.attachments = attachments;

  const res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(cfg.sender) + '/sendMail',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Graph sendMail ' + res.status + ' : ' + t.slice(0, 300));
  }
}
