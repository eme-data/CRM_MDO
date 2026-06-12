'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, Building2, LifeBuoy, Server, ShieldCheck, Settings2,
  BookOpen, KeyRound, Users as UsersIcon, BarChart3, Workflow,
  Clock, FileText, Search, Lock, ArrowRight, CheckSquare,
} from 'lucide-react';
import { useBranding } from '@/components/BrandingProvider';

// Documentation administrateur & utilisateur INTEGREE.
// Contenu statique : recapitule et presente les fonctionnalites du CRM.
// La structure suit la cartographie reelle de la sidebar (sections + routes).

type DocItem = { name: string; href?: string; role?: string; desc: string };
type DocSection = { id: string; title: string; icon: any; blurb: string; items: DocItem[] };

const USER_SECTIONS: DocSection[] = [
  {
    id: 'pilotage', title: 'Pilotage', icon: LayoutDashboard,
    blurb: 'Vue d\'ensemble de l\'activite : indicateurs, sante des clients et reporting.',
    items: [
      { name: 'Tableau de bord', href: '/dashboard', desc: 'MRR, pipeline commercial, contrats qui expirent, activites recentes. Point d\'entree quotidien.' },
      { name: 'Sante clients', href: '/health-overview', desc: 'Score de sante par client (engagement, tickets, contrats) pour reperer les comptes a risque.' },
      { name: 'QBR / Customer Success', href: '/customer-success', desc: 'Preparation des revues trimestrielles (Quarterly Business Review) avec les clients.' },
      { name: 'Reporting', href: '/reports', desc: 'Rapports et statistiques transverses sur l\'activite.' },
    ],
  },
  {
    id: 'commercial', title: 'Commercial', icon: Building2,
    blurb: 'Le cycle de vente complet : du prospect au contrat facture.',
    items: [
      { name: 'Societes', href: '/companies', desc: 'Fiches entreprises (PME/TPE/Collectivite/Sante/Industrie), statut Lead/Prospect/Client. Recherche enrichie via Pappers/INSEE.' },
      { name: 'Contacts', href: '/contacts', desc: 'Interlocuteurs rattaches aux societes, avec contact principal.' },
      { name: 'Opportunites', href: '/opportunities', desc: 'Pipeline kanban : Qualification -> Proposition -> Negociation -> Gagne/Perdu.' },
      { name: 'Devis', href: '/quotes', desc: 'Creation de devis a partir du catalogue produits, conversion en contrat.' },
      { name: 'Contrats', href: '/contracts', desc: 'Offres MDO Essentiel/Pro/Souverain, engagement, tacite reconduction, renouvellement en 1 clic, resiliation, chainage du contrat precedent. Alertes de renouvellement automatiques (90/60/30/7 jours).' },
      { name: 'Factures', href: '/invoices', desc: 'Suivi des factures (generation interne ou synchronisation Qonto cote admin).' },
    ],
  },
  {
    id: 'support', title: 'Service & Support', icon: LifeBuoy,
    blurb: 'Gestion des demandes clients et du travail terrain.',
    items: [
      { name: 'Support (tickets)', href: '/tickets', desc: 'Tickets avec SLA par offre, reponses par email (threading), pieces jointes. Creation automatique depuis la boite support@ (IMAP).' },
      { name: 'Interventions', href: '/interventions', desc: 'On-site / remote / phone, liees a un contrat et a un technicien.' },
      { name: 'Mode terrain (tactile)', href: '/field', desc: 'Interface tactile simplifiee pour les techniciens en deplacement.' },
      { name: 'Appels', href: '/calls', desc: 'Journal des appels (entrants/sortants) rattaches aux clients.' },
      { name: 'Calendrier', href: '/calendar', desc: 'Vue calendrier des interventions. Export iCal authentifie pour brancher Outlook/Google Calendar.' },
    ],
  },
  {
    id: 'infogerance', title: 'Infogerance & Cybersecurite', icon: Server,
    blurb: 'Supervision technique et securite du parc des clients (cœur du metier MSP).',
    items: [
      { name: 'Assets clients', href: '/assets', desc: 'Inventaire du parc materiel/logiciel, certificats SSL et domaines (avec alertes d\'expiration).' },
      { name: 'Lifecycle materiel', href: '/asset-lifecycle', desc: 'Suivi du cycle de vie des equipements (achat, garantie, fin de vie).' },
      { name: 'Patch management', href: '/patch-management', desc: 'Etat des mises a jour de securite sur les postes/serveurs supervises.' },
      { name: 'Backup verification', href: '/backups', desc: 'Verification que les sauvegardes clients tournent bien.' },
      { name: 'Surveillance', href: '/surveillance', desc: 'Supervision consolidee des assets et alertes.' },
      { name: 'Uptime sites', href: '/uptime', desc: 'Monitoring de disponibilite des sites web clients, alertes DOWN/UP par email.' },
      { name: 'Audit DNS', href: '/audit-dns', desc: 'Controle de la configuration DNS (SPF, DKIM, DMARC, etc.).' },
      { name: 'Email security', href: '/email-security', desc: 'Analyse de la securite de la messagerie (anti-spoofing, conformite).' },
      { name: 'Console SOC', href: '/soc', desc: 'Centralisation des alertes de securite (dont Microsoft 365 / Proxmox).' },
      { name: 'Phishing campagnes', href: '/phishing', desc: 'Campagnes de sensibilisation au phishing et resultats par utilisateur.' },
    ],
  },
  {
    id: 'outils', title: 'Outils', icon: CheckSquare,
    blurb: 'Productivite et capitalisation de la connaissance.',
    items: [
      { name: 'Taches', href: '/tasks', desc: 'Kanban TODO/DOING/DONE, assignables, rattachables a n\'importe quelle entite.' },
      { name: 'Templates', href: '/templates', desc: 'Modeles de reponses reutilisables (tickets, emails).' },
      { name: 'Knowledge base', href: '/kb', desc: 'Base de connaissances interne (procedures, articles).' },
    ],
  },
  {
    id: 'perso', title: 'Mon espace', icon: Clock,
    blurb: 'Vos outils personnels, en bas de la barre laterale.',
    items: [
      { name: 'Mon temps', href: '/time', desc: 'Saisie de votre temps passe (pour le suivi et la facturation au temps).' },
      { name: 'Mon profil', href: '/settings', desc: 'Vos informations, signature email, 2FA (TOTP), token iCal, sessions/appareils.' },
    ],
  },
];

const ADMIN_SECTIONS: DocSection[] = [
  {
    id: 'config', title: 'Configuration', icon: Settings2,
    blurb: 'Parametrage de l\'instance. Reserve aux administrateurs.',
    items: [
      { name: 'API, SMTP, IMAP', href: '/admin/settings', role: 'ADMIN', desc: 'Cles API (Pappers/INSEE), SMTP sortant (ou Microsoft Graph), IMAP entrant, SLA par offre, Qonto, et SSO. Bouton "Tester" pour valider l\'envoi.' },
      { name: 'Utilisateurs', href: '/users', role: 'ADMIN', desc: 'Creation/desactivation des comptes, roles (ADMIN/MANAGER/SALES/READONLY), reset de mot de passe.' },
      { name: 'Imports CSV', href: '/imports', role: 'ADMIN', desc: 'Import en masse de societes/contacts depuis un fichier CSV.' },
      { name: 'Catalogue produits', href: '/admin/products', role: 'ADMIN', desc: 'Produits/services facturables utilises dans les devis et contrats.' },
      { name: 'Templates devis', href: '/admin/quote-templates', role: 'ADMIN', desc: 'Modeles de devis pre-remplis.' },
    ],
  },
  {
    id: 'pilotage-msp', title: 'Pilotage MSP', icon: BarChart3,
    blurb: 'Indicateurs de gestion de la societe.',
    items: [
      { name: 'Dashboard exec MSP', href: '/admin/executive', role: 'ADMIN', desc: 'Vue executive : KPIs strategiques de l\'activite MSP.' },
      { name: 'Marges / rentabilite', href: '/admin/profitability', role: 'ADMIN', desc: 'Rentabilite par client/contrat (revenu vs cout du temps technicien).' },
      { name: 'Win / Loss analysis', href: '/admin/win-loss', role: 'ADMIN', desc: 'Analyse des opportunites gagnees/perdues.' },
      { name: 'Facturation du temps', href: '/admin/time-billing', role: 'ADMIN', desc: 'Valorisation et facturation du temps saisi par les techniciens.' },
      { name: 'Skills matrix equipe', href: '/admin/skills', role: 'ADMIN', desc: 'Cartographie des competences de l\'equipe.' },
    ],
  },
  {
    id: 'automatisation', title: 'Automatisation & integrations', icon: Workflow,
    blurb: 'Connecter le CRM et automatiser les taches repetitives.',
    items: [
      { name: 'Facturation (Qonto)', href: '/admin/billing', role: 'ADMIN', desc: 'Connecteur Qonto (PDP de facturation electronique + rapprochement bancaire).' },
      { name: 'Drip campaigns email', href: '/admin/drip', role: 'ADMIN', desc: 'Sequences d\'emails automatises (nurturing commercial).' },
      { name: 'Cles API publique', href: '/admin/api-keys', role: 'ADMIN', desc: 'Cles pour l\'API publique du CRM (integrations tierces).' },
      { name: 'Webhooks sortants', href: '/admin/webhooks', role: 'ADMIN', desc: 'Notifications HTTP vers des systemes externes lors d\'evenements.' },
      { name: 'Regles workflow', href: '/admin/workflow-rules', role: 'ADMIN', desc: 'Automatisations declenchees par des conditions (ex : a la creation d\'un ticket).' },
      { name: 'Taches recurrentes', href: '/admin/recurring-tasks', role: 'ADMIN', desc: 'Generation automatique de taches periodiques (ex : check backup mensuel).' },
      { name: 'Cron jobs / planificateur', href: '/admin/cron-jobs', role: 'ADMIN', desc: 'Visualisation des taches planifiees du backend et de leur etat.' },
    ],
  },
  {
    id: 'standardisation', title: 'Standardisation infogerance', icon: FileText,
    blurb: 'Modeles et procedures pour industrialiser la prestation.',
    items: [
      { name: 'Templates assets flexibles', href: '/admin/flexible-asset-types', role: 'ADMIN', desc: 'Definition de types d\'assets personnalises (a la IT Glue).' },
      { name: 'Runbooks / procedures', href: '/admin/runbooks', role: 'ADMIN', desc: 'Procedures techniques documentees et reutilisables.' },
      { name: 'Templates onboarding', href: '/admin/onboarding-templates', role: 'ADMIN', desc: 'Parcours type d\'integration d\'un nouveau client.' },
      { name: 'Rapports clients mensuels', href: '/admin/client-reports', role: 'ADMIN', desc: 'Generation des rapports d\'activite envoyes aux clients.' },
    ],
  },
  {
    id: 'gouvernance', title: 'Securite, sauvegarde & conformite', icon: ShieldCheck,
    blurb: 'Resilience de l\'instance et conformite RGPD.',
    items: [
      { name: 'Backup / Restore CRM', href: '/admin/system-backup', role: 'SUPER-ADMIN', desc: 'Sauvegarde complete (BDD + uploads) : creation manuelle, telechargement, restauration, planification. Panneau backup OFF-SITE chiffre (restic) vers un stockage distant.' },
      { name: 'Health check systeme', href: '/admin/health', role: 'ADMIN', desc: 'Etat de sante de l\'infrastructure (BDD, Redis, disque, fraicheur des backups off-site).' },
      { name: 'Sous-traitants RGPD (DPA)', href: '/admin/subprocessors', role: 'ADMIN', desc: 'Registre des sous-traitants et de leurs accords de traitement (DPA).' },
      { name: "Journal d'activite", href: '/admin/activity', role: 'ADMIN', desc: 'Audit : qui a fait quoi et quand (tracabilite des actions sensibles).' },
      { name: 'Tenants (super-admin)', href: '/admin/tenants', role: 'SUPER-ADMIN', desc: 'Gestion des instances clientes (multi-tenant) : creation, branding, suspension.' },
    ],
  },
];

function SectionCard({ s }: { s: DocSection }) {
  const Icon = s.icon;
  return (
    <section id={s.id} className="card p-6 scroll-mt-20">
      <div className="flex items-center gap-3 pb-3 border-b">
        <div className="h-9 w-9 rounded-lg bg-mdo-100 text-mdo-600 flex items-center justify-center">
          <Icon size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-lg">{s.title}</h2>
          <p className="text-xs text-slate-500">{s.blurb}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y">
        {s.items.map((it) => (
          <li key={it.name} className="py-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
            <div className="sm:w-52 shrink-0">
              {it.href ? (
                <Link href={it.href} className="text-sm font-medium text-mdo-700 hover:underline inline-flex items-center gap-1">
                  {it.name} <ArrowRight size={12} />
                </Link>
              ) : (
                <span className="text-sm font-medium">{it.name}</span>
              )}
              {it.role && (
                <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 align-middle">
                  {it.role}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 flex-1">{it.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AidePage() {
  const branding = useBranding();
  const [tab, setTab] = useState<'user' | 'admin'>('user');
  const sections = tab === 'user' ? USER_SECTIONS : ADMIN_SECTIONS;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BookOpen size={28} className="text-mdo-600" /> Documentation
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {`Guide d'utilisation du CRM ${branding.shortName} — recapitulatif et presentation de l'ensemble des fonctionnalites.`}
        </p>
      </div>

      {/* Premiers pas */}
      <div className="card p-6 space-y-4 bg-slate-50/60">
        <h2 className="font-semibold flex items-center gap-2"><Search size={18} className="text-mdo-600" /> Premiers pas</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-600">
          <div className="flex gap-3">
            <Lock size={16} className="text-mdo-600 shrink-0 mt-0.5" />
            <p><strong>Connexion & securite.</strong> Login par mot de passe ou via Microsoft 365 (SSO). La double authentification (2FA / TOTP) est obligatoire pour les roles ADMIN et MANAGER — configurez-la dans <Link href="/settings" className="text-mdo-700 hover:underline">Mon profil</Link>.</p>
          </div>
          <div className="flex gap-3">
            <Search size={16} className="text-mdo-600 shrink-0 mt-0.5" />
            <p><strong>Navigation rapide.</strong> Appuyez sur <kbd className="rounded border px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border px-1 text-xs">K</kbd> partout pour rechercher et naviguer instantanement.</p>
          </div>
          <div className="flex gap-3">
            <UsersIcon size={16} className="text-mdo-600 shrink-0 mt-0.5" />
            <p><strong>Roles.</strong> <em>ADMIN</em> (tout + configuration), <em>MANAGER</em> (pilotage equipe), <em>SALES</em> (acces standard), <em>READONLY</em> (lecture seule). Vos acces dependent de votre role.</p>
          </div>
          <div className="flex gap-3">
            <KeyRound size={16} className="text-mdo-600 shrink-0 mt-0.5" />
            <p><strong>Coffre-fort.</strong> {"Les secrets clients (mots de passe, TOTP) sont stockes chiffres ; chaque consultation est tracee dans le journal d'activite (RGPD)."}</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('user')}
          className={'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ' + (tab === 'user' ? 'border-mdo-600 text-mdo-700' : 'border-transparent text-slate-500 hover:text-slate-700')}
        >
          Guide utilisateur
        </button>
        <button
          onClick={() => setTab('admin')}
          className={'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ' + (tab === 'admin' ? 'border-mdo-600 text-mdo-700' : 'border-transparent text-slate-500 hover:text-slate-700')}
        >
          Guide administrateur
        </button>
      </div>

      {/* Sommaire de l'onglet courant */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <a key={s.id} href={'#' + s.id} className="rounded-full border px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 transition">
            {s.title}
          </a>
        ))}
      </div>

      {/* Contenu */}
      <div className="space-y-5">
        {sections.map((s) => <SectionCard key={s.id} s={s} />)}
      </div>

      {tab === 'admin' && (
        <div className="card p-4 text-xs text-slate-500 flex items-center gap-2">
          <ShieldCheck size={14} className="text-amber-600" />
          Les fonctions marquees <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">ADMIN</span> / <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">SUPER-ADMIN</span> ne sont visibles que pour les comptes disposant du role correspondant.
        </div>
      )}

      <p className="text-xs text-slate-400 pt-2">
        Cette documentation reflete les fonctionnalites disponibles dans votre instance. Une question ? Contactez votre administrateur.
      </p>
    </div>
  );
}
