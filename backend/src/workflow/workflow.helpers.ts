// Helpers PURS du moteur de workflow : substitution de placeholders + validation
// des params trigger/action. Testes en isolation (cf workflow.helpers.spec.ts).
//
// Format placeholder : `{fieldName}` ou `{nested.path}` — substitue par la
// valeur correspondante dans l'objet `entity`. Si la cle est absente, on
// laisse le placeholder tel quel (visible cote UI = signal que le champ
// n'existe pas dans le contexte de cette regle).

export function substitutePlaceholders(template: string, entity: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, path: string) => {
    const value = path.split('.').reduce<any>((acc, k) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[k];
    }, entity);
    if (value === undefined || value === null) return match;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  });
}

// Validation des params trigger : retourne null si OK, sinon message d'erreur
// utilisateur (utilise par le controller pour rejeter une regle malformee
// avant qu'elle ne fasse n'importe quoi en prod).
export function validateTriggerParams(trigger: string, params: any): string | null {
  if (params == null || typeof params !== 'object') return 'triggerParams doit etre un objet';
  switch (trigger) {
    case 'CONTRACT_EXPIRING':
    case 'ASSET_EXPIRING': {
      const d = params.daysBefore;
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 365) {
        return 'daysBefore doit etre un entier 1-365';
      }
      return null;
    }
    case 'INVOICE_OVERDUE': {
      const d = params.daysOverdue;
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 365) {
        return 'daysOverdue doit etre un entier 0-365';
      }
      return null;
    }
    case 'TICKET_OVERDUE':
      // Pas de param attendu
      return null;
    default:
      return 'Trigger inconnu : ' + trigger;
  }
}

export function validateActionParams(action: string, params: any): string | null {
  if (params == null || typeof params !== 'object') return 'actionParams doit etre un objet';
  switch (action) {
    case 'CREATE_TASK': {
      if (typeof params.titleTemplate !== 'string' || params.titleTemplate.length < 2 || params.titleTemplate.length > 200) {
        return 'titleTemplate doit etre une string 2-200 chars';
      }
      if (
        params.priority !== undefined &&
        !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(params.priority)
      ) {
        return 'priority doit etre LOW/NORMAL/HIGH/URGENT';
      }
      if (
        params.dueDateOffsetDays !== undefined &&
        (typeof params.dueDateOffsetDays !== 'number' ||
          !Number.isInteger(params.dueDateOffsetDays) ||
          params.dueDateOffsetDays < 0 ||
          params.dueDateOffsetDays > 365)
      ) {
        return 'dueDateOffsetDays doit etre un entier 0-365';
      }
      return null;
    }
    case 'CREATE_NOTIFICATION': {
      if (typeof params.title !== 'string' || params.title.length < 2 || params.title.length > 200) {
        return 'title doit etre une string 2-200 chars';
      }
      if (
        params.targetRole !== undefined &&
        !['ADMIN', 'MANAGER', 'OWNER'].includes(params.targetRole)
      ) {
        return 'targetRole doit etre ADMIN/MANAGER/OWNER';
      }
      return null;
    }
    default:
      return 'Action inconnue : ' + action;
  }
}
