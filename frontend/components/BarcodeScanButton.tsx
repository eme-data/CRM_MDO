'use client';
import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { scanBarcode } from '@/lib/native';

// Bouton universel "Scanner un code". Marche dans :
//   - L'app native Capacitor (si plugin BarcodeScanner ajoute, cf mobile/README)
//   - Chrome Android (BarcodeDetector natif)
//   - Safari iOS 17+ avec experimental flag
//   - Fallback : message d'erreur et le user saisit a la main
//
// Cas d'usage MDO : scanner l'etiquette d'un asset (serveur, switch) en
// intervention pour retrouver sa fiche dans le CRM en 1 seconde au lieu de
// taper le numero de serie manuellement.

interface Props {
  onScan: (text: string) => void;
  label?: string;
  className?: string;
  variant?: 'primary' | 'secondary';
}

export function BarcodeScanButton({
  onScan, label = 'Scanner', className = '', variant = 'secondary',
}: Props) {
  const [scanning, setScanning] = useState(false);

  async function handleClick() {
    setScanning(true);
    try {
      const result = await scanBarcode();
      if (!result) {
        toast.info(
          'Scan non disponible sur ce navigateur. Utilisez Chrome Android ou installez l\'app mobile MDO.',
        );
        return;
      }
      if (!result.text) {
        toast.error('Code non lu, reessayez');
        return;
      }
      onScan(result.text);
    } catch (err: any) {
      toast.error('Echec du scan : ' + err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={scanning}
      className={
        'inline-flex items-center gap-2 ' +
        (variant === 'primary' ? 'btn btn-primary' : 'btn btn-secondary') +
        ' ' + className
      }
    >
      <ScanLine size={14} className={scanning ? 'animate-pulse' : ''} />
      {scanning ? 'Scan...' : label}
    </button>
  );
}
