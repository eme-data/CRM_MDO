import {
  substitutePlaceholders,
  validateTriggerParams,
  validateActionParams,
} from './workflow.helpers';

describe('substitutePlaceholders', () => {
  it('substitue un placeholder simple', () => {
    expect(substitutePlaceholders('Hello {name}', { name: 'World' })).toBe('Hello World');
  });

  it('substitue plusieurs placeholders', () => {
    expect(
      substitutePlaceholders('Contrat {reference} client {company}', {
        reference: 'MDO-2026-001',
        company: 'ACME',
      }),
    ).toBe('Contrat MDO-2026-001 client ACME');
  });

  it('supporte les chemins imbriques avec .', () => {
    expect(
      substitutePlaceholders('Client : {company.name}', { company: { name: 'ACME' } }),
    ).toBe('Client : ACME');
  });

  it('formatte les Date en ISO YYYY-MM-DD', () => {
    expect(
      substitutePlaceholders('Echeance {endDate}', { endDate: new Date('2026-06-15T14:30:00Z') }),
    ).toBe('Echeance 2026-06-15');
  });

  it("laisse le placeholder en clair si la cle est absente (signal pour l'admin)", () => {
    expect(substitutePlaceholders('Hello {missing}', { name: 'World' })).toBe('Hello {missing}');
  });

  it('laisse en clair si la valeur est null/undefined', () => {
    expect(substitutePlaceholders('X={a} Y={b}', { a: null, b: undefined })).toBe('X={a} Y={b}');
  });

  it('convertit les nombres en string', () => {
    expect(substitutePlaceholders('{count} jours', { count: 30 })).toBe('30 jours');
  });

  it('retourne une chaine vide pour un template falsy', () => {
    expect(substitutePlaceholders('', { x: 1 })).toBe('');
  });
});

describe('validateTriggerParams', () => {
  it('CONTRACT_EXPIRING : exige daysBefore entier 1-365', () => {
    expect(validateTriggerParams('CONTRACT_EXPIRING', { daysBefore: 60 })).toBeNull();
    expect(validateTriggerParams('CONTRACT_EXPIRING', { daysBefore: 0 })).toContain('1-365');
    expect(validateTriggerParams('CONTRACT_EXPIRING', { daysBefore: 366 })).toContain('1-365');
    expect(validateTriggerParams('CONTRACT_EXPIRING', { daysBefore: '60' })).toContain('1-365');
    expect(validateTriggerParams('CONTRACT_EXPIRING', {})).toContain('1-365');
  });

  it('ASSET_EXPIRING : meme regle que contract', () => {
    expect(validateTriggerParams('ASSET_EXPIRING', { daysBefore: 30 })).toBeNull();
    expect(validateTriggerParams('ASSET_EXPIRING', { daysBefore: -1 })).toContain('1-365');
  });

  it('INVOICE_OVERDUE : daysOverdue entier 0-365', () => {
    expect(validateTriggerParams('INVOICE_OVERDUE', { daysOverdue: 0 })).toBeNull();
    expect(validateTriggerParams('INVOICE_OVERDUE', { daysOverdue: 30 })).toBeNull();
    expect(validateTriggerParams('INVOICE_OVERDUE', { daysOverdue: -1 })).toContain('0-365');
  });

  it('TICKET_OVERDUE : pas de param requis', () => {
    expect(validateTriggerParams('TICKET_OVERDUE', {})).toBeNull();
  });

  it('rejette un trigger inconnu', () => {
    expect(validateTriggerParams('FOOBAR', {})).toContain('inconnu');
  });

  it('rejette des params non-objet', () => {
    expect(validateTriggerParams('TICKET_OVERDUE', null)).toContain('objet');
    expect(validateTriggerParams('TICKET_OVERDUE', 'string')).toContain('objet');
  });
});

describe('validateActionParams', () => {
  it('CREATE_TASK : exige titleTemplate string 2-200', () => {
    expect(validateActionParams('CREATE_TASK', { titleTemplate: 'OK' })).toBeNull();
    expect(validateActionParams('CREATE_TASK', { titleTemplate: 'A' })).toContain('2-200');
    expect(validateActionParams('CREATE_TASK', {})).toContain('2-200');
  });

  it('CREATE_TASK : priority optionnel mais valide si fourni', () => {
    expect(validateActionParams('CREATE_TASK', { titleTemplate: 'OK', priority: 'HIGH' })).toBeNull();
    expect(
      validateActionParams('CREATE_TASK', { titleTemplate: 'OK', priority: 'INVALID' }),
    ).toContain('priority');
  });

  it('CREATE_TASK : dueDateOffsetDays optionnel mais entier 0-365', () => {
    expect(
      validateActionParams('CREATE_TASK', { titleTemplate: 'OK', dueDateOffsetDays: 7 }),
    ).toBeNull();
    expect(
      validateActionParams('CREATE_TASK', { titleTemplate: 'OK', dueDateOffsetDays: -1 }),
    ).toContain('0-365');
  });

  it('CREATE_NOTIFICATION : exige title + targetRole valide', () => {
    expect(validateActionParams('CREATE_NOTIFICATION', { title: 'OK' })).toBeNull();
    expect(
      validateActionParams('CREATE_NOTIFICATION', { title: 'OK', targetRole: 'ADMIN' }),
    ).toBeNull();
    expect(
      validateActionParams('CREATE_NOTIFICATION', { title: 'OK', targetRole: 'INVALID' }),
    ).toContain('targetRole');
  });

  it('rejette une action inconnue', () => {
    expect(validateActionParams('FOO', {})).toContain('inconnue');
  });
});
