'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

interface Device {
  id: string;
  externalId: string;
  deviceName: string;
  operatingSystem: string | null;
  osVersion: string | null;
  complianceState: string | null;
  managementAgent: string | null;
  lastSyncDateTime: string | null;
  isEncrypted: boolean;
  userPrincipalName: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  m365Tenant: { companyId: string; company: { id: string; name: string } | null };
}

const COMPLIANCE_COLOR: Record<string, string> = {
  compliant: 'bg-emerald-100 text-emerald-700',
  noncompliant: 'bg-red-100 text-red-700',
  inGracePeriod: 'bg-amber-100 text-amber-700',
  unknown: 'bg-slate-100 text-slate-500',
  configManager: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
};

export default function PatchManagementPage() {
  const [items, setItems] = useState<Device[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('');

  async function load() {
    const [list, st] = await Promise.all([
      api.get('/patch-management/devices' + (filter ? '?complianceState=' + filter : '')),
      api.get('/patch-management/stats'),
    ]);
    setItems(list); setStats(st);
  }
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Cpu size={28} className="text-mdo-600" /> Patch management (Intune)
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Devices Intune des tenants M365 clients. Cron quotidien 04:30 sync via Graph API.
          Permission requise cote app : <code>DeviceManagementManagedDevices.Read.All</code>.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-3"><p className="text-xs text-slate-500">Total devices</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500 flex items-center gap-1"><Lock size={11} /> Chiffres</p><p className="text-2xl font-bold text-emerald-600">{stats.encryptedPct}%</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle size={11} /> Sync &gt; 7j</p><p className="text-2xl font-bold text-amber-600">{stats.staleSyncCount}</p></div>
          {(stats.byCompliance || []).slice(0, 2).map((c: any) => (
            <div key={c.state} className="card p-3"><p className="text-xs text-slate-500">{c.state}</p><p className={'text-2xl font-bold ' + (c.state === 'compliant' ? 'text-emerald-600' : c.state === 'noncompliant' ? 'text-red-600' : 'text-slate-600')}>{c.count}</p></div>
          ))}
        </div>
      )}

      <div className="card p-4 flex items-center gap-3">
        <select className="input max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Toutes compliances</option>
          <option value="compliant">Compliant</option>
          <option value="noncompliant">Non compliant</option>
          <option value="inGracePeriod">Grace period</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Device</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">OS</th>
              <th className="p-3 font-medium">Compliance</th>
              <th className="p-3 font-medium text-center">Encrypted</th>
              <th className="p-3 font-medium">Dernier sync device</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucun device. Verifiez que les tenants M365 ont accorde DeviceManagementManagedDevices.Read.All.</td></tr>
            ) : items.map((d) => (
              <tr key={d.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-medium">{d.deviceName}</div>
                  {d.manufacturer && <div className="text-xs text-slate-400">{d.manufacturer} {d.model}</div>}
                </td>
                <td className="p-3 text-xs">
                  {d.m365Tenant.company ? (
                    <Link href={'/companies/' + d.m365Tenant.company.id} className="text-mdo-600 hover:underline">{d.m365Tenant.company.name}</Link>
                  ) : '-'}
                </td>
                <td className="p-3 text-xs">{d.userPrincipalName ?? '-'}</td>
                <td className="p-3 text-xs">{d.operatingSystem} {d.osVersion}</td>
                <td className="p-3">
                  {d.complianceState && (
                    <span className={'badge ' + (COMPLIANCE_COLOR[d.complianceState] ?? 'bg-slate-100 text-slate-700')}>
                      {d.complianceState}
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">{d.isEncrypted ? <Lock size={14} className="text-emerald-600 mx-auto" /> : <Lock size={14} className="text-slate-300 mx-auto" />}</td>
                <td className="p-3 text-xs">{d.lastSyncDateTime ? formatDateTime(d.lastSyncDateTime) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
