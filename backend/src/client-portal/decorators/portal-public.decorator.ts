import { SetMetadata } from '@nestjs/common';

// Marque une route portail comme accessible sans session portail. Utilise sur
// /portal/auth/request-magic-link et /portal/auth/verify.
// Distinct de @Public() (utilise pour les routes globalement publiques cote CRM).
export const PORTAL_PUBLIC_KEY = 'portalPublic';
export const PortalPublic = () => SetMetadata(PORTAL_PUBLIC_KEY, true);
