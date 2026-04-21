'use client';

import { useMemo, useState } from 'react';
import {
  Shield,
  Mail,
  Pencil,
  Trash2,
  UserPlus,
  Check,
  Circle,
  Layers,
  Megaphone,
  Wrench,
  Search as SearchIcon,
  CalendarDays,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { User, UserRole, PermissionScope, UserStatus } from '@/lib/types';

interface ScopeMeta {
  key: PermissionScope;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const SCOPES: ScopeMeta[] = [
  { key: 'today',     label: 'Today',       hint: 'Briefing, To-do',                            icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'pipeline',  label: 'Pipeline',    hint: 'Plays, Prospects, Leads, Conversations',     icon: <Layers className="h-3.5 w-3.5" /> },
  { key: 'web',       label: 'Website',     hint: 'Traffic, SEO, Pages, Keywords',              icon: <SearchIcon className="h-3.5 w-3.5" /> },
  { key: 'broadcast', label: 'Broadcast',   hint: 'Social & blogs',                             icon: <Megaphone className="h-3.5 w-3.5" /> },
  { key: 'system',    label: 'System',      hint: 'Connections, Settings, Users',               icon: <Wrench className="h-3.5 w-3.5" /> },
];

const STATUS_TONE: Record<UserStatus, string> = {
  active: 'bg-evari-success text-evari-ink',
  pending: 'bg-evari-warn text-evari-goldInk',
  suspended: 'bg-evari-danger text-white',
};

function scopeSummary(user: User): string {
  if (user.role === 'super_admin') return 'Super admin · full access';
  if (user.scopes.includes('all')) return 'Full access';
  if (user.scopes.length === 0) return 'No access yet';
  return user.scopes
    .map((s) => SCOPES.find((m) => m.key === s)?.label ?? s)
    .join(' · ');
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [editing, setEditing] = useState<User | null>(null);
  const [inviting, setInviting] = useState(false);
  const confirm = useConfirm();

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) => {
        const statusOrder: Record<UserStatus, number> = {
          active: 0,
          pending: 1,
          suspended: 2,
        };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return a.fullName.localeCompare(b.fullName);
      }),
    [users],
  );

  async function removeUser(u: User) {
    if (u.id === currentUserId) {
      await confirm({
        title: "Can't remove yourself",
        description:
          "You're the currently logged-in user. Ask another super admin to do it if you really need to.",
        confirmLabel: 'OK',
      });
      return;
    }
    const ok = await confirm({
      title: 'Remove user?',
      description: `${u.fullName} will lose access immediately. Their historical actions stay on record.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  }

  function saveUser(id: string, changes: Partial<User>) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...changes } : u)),
    );
    setEditing(null);
  }

  function inviteUser(email: string, fullName: string, role: UserRole, scopes: PermissionScope[]) {
    const now = new Date().toISOString();
    const u: User = {
      id: 'u-' + Math.random().toString(36).slice(2, 9),
      email,
      fullName,
      role,
      scopes: role === 'super_admin' ? ['all'] : scopes,
      status: 'pending',
      invitedAt: now,
    };
    setUsers((prev) => [u, ...prev]);
    setInviting(false);
  }

  return (
    <div className="p-6 space-y-5">
      {/* Intro */}
      <section className="rounded-xl bg-evari-surface p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-evari-text">
            Team access
          </div>
          <p className="text-sm text-evari-dim leading-relaxed mt-1 max-w-2xl">
            Invite people by email and grant them access to one or more sections.
            Super admins see everything. Members only see the sections you tick —
            the sidebar hides everything else for them.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setInviting(true)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite user
        </Button>
      </section>

      {/* List */}
      <div className="space-y-1">
        <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          <div className="col-span-4">User</div>
          <div className="col-span-5">Access</div>
          <div className="col-span-2 text-right">Last seen</div>
          <div className="col-span-1 text-right">Status</div>
        </div>
        <ul className="space-y-1">
          {sorted.map((u) => (
            <li
              key={u.id}
              className="group relative bg-evari-surface/60 rounded-md hover:bg-evari-surface transition-colors"
            >
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  aria-label="Edit user"
                  title="Edit"
                  onClick={() => setEditing(u)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  aria-label="Remove user"
                  title="Remove"
                  onClick={() => void removeUser(u)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center pr-12">
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-evari-surfaceSoft flex items-center justify-center text-[10px] text-evari-dim font-medium uppercase shrink-0">
                    {initials(u.fullName)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-evari-text truncate flex items-center gap-1.5">
                      {u.fullName}
                      {u.id === currentUserId && (
                        <Badge variant="muted" className="text-[9px]">
                          you
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-evari-dim truncate">
                      {u.email}
                    </div>
                  </div>
                </div>
                <div className="col-span-5 flex items-center gap-1.5 flex-wrap">
                  {u.role === 'super_admin' ? (
                    <Badge variant="gold" className="text-[10px]">
                      <Shield className="h-3 w-3" />
                      Super admin
                    </Badge>
                  ) : u.scopes.length === 0 ? (
                    <Badge variant="muted" className="text-[10px]">
                      No access
                    </Badge>
                  ) : (
                    SCOPES.filter((s) => u.scopes.includes(s.key)).map((s) => (
                      <Badge
                        key={s.key}
                        variant="muted"
                        className="text-[10px]"
                      >
                        {s.icon}
                        {s.label}
                      </Badge>
                    ))
                  )}
                </div>
                <div className="col-span-2 text-right text-xs text-evari-dim font-mono tabular-nums">
                  {u.lastSeenAt ? relativeTime(u.lastSeenAt) : 'never'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5',
                      STATUS_TONE[u.status],
                    )}
                  >
                    {u.status}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Invite dialog */}
      <Dialog
        open={inviting}
        onOpenChange={(open) => {
          if (!open) setInviting(false);
        }}
      >
        {inviting && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Invite a user</DialogTitle>
              <DialogDescription>
                They'll receive an email invite. You can change their access at
                any time from this page.
              </DialogDescription>
            </DialogHeader>
            <InviteForm
              onSubmit={inviteUser}
              onCancel={() => setInviting(false)}
            />
          </DialogContent>
        )}
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit {editing.fullName}</DialogTitle>
              <DialogDescription>
                Change role and access. {editing.id === currentUserId ? (
                  <span>
                    You can't change your own role — ask another super admin.
                  </span>
                ) : (
                  'Changes apply on next sign-in.'
                )}
              </DialogDescription>
            </DialogHeader>
            <EditForm
              user={editing}
              lockRole={editing.id === currentUserId}
              onSubmit={(changes) => saveUser(editing.id, changes)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared access-picker UI used by both forms

function ScopePicker({
  role,
  scopes,
  onRoleChange,
  onScopesChange,
  lockRole = false,
}: {
  role: UserRole;
  scopes: PermissionScope[];
  onRoleChange: (r: UserRole) => void;
  onScopesChange: (s: PermissionScope[]) => void;
  lockRole?: boolean;
}) {
  function toggle(s: PermissionScope) {
    if (scopes.includes(s)) onScopesChange(scopes.filter((x) => x !== s));
    else onScopesChange([...scopes, s]);
  }
  function allOn() {
    onScopesChange(SCOPES.map((s) => s.key));
  }
  function allOff() {
    onScopesChange([]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Role
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={lockRole}
            onClick={() => onRoleChange('super_admin')}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md p-3 text-left transition-colors',
              role === 'super_admin'
                ? 'bg-evari-surfaceSoft'
                : 'bg-evari-surface/60 hover:bg-evari-surfaceSoft',
              lockRole && 'opacity-60 cursor-not-allowed',
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-evari-text">
              <Shield className="h-3.5 w-3.5 text-evari-gold" />
              Super admin
            </div>
            <div className="text-[11px] text-evari-dim leading-snug">
              Full access. Can invite + remove users.
            </div>
          </button>
          <button
            type="button"
            disabled={lockRole}
            onClick={() => onRoleChange('member')}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md p-3 text-left transition-colors',
              role === 'member'
                ? 'bg-evari-surfaceSoft'
                : 'bg-evari-surface/60 hover:bg-evari-surfaceSoft',
              lockRole && 'opacity-60 cursor-not-allowed',
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-evari-text">
              <Mail className="h-3.5 w-3.5 text-evari-dim" />
              Member
            </div>
            <div className="text-[11px] text-evari-dim leading-snug">
              Only sees the sections you tick below.
            </div>
          </button>
        </div>
      </div>

      {role === 'member' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Access
            </span>
            <div className="inline-flex items-center gap-0.5 text-[10px]">
              <button
                type="button"
                onClick={allOn}
                className="px-1.5 py-0.5 rounded text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft"
              >
                All
              </button>
              <span className="text-evari-dimmer">·</span>
              <button
                type="button"
                onClick={allOff}
                className="px-1.5 py-0.5 rounded text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft"
              >
                None
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {SCOPES.map((s) => {
              const on = scopes.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                    on
                      ? 'bg-evari-surfaceSoft'
                      : 'bg-evari-surface/60 hover:bg-evari-surfaceSoft',
                  )}
                >
                  <span
                    className={cn(
                      'h-4 w-4 rounded-sm inline-flex items-center justify-center shrink-0',
                      on
                        ? 'bg-evari-gold text-evari-goldInk'
                        : 'bg-evari-surfaceSoft',
                    )}
                  >
                    {on ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Circle className="h-2 w-2 text-evari-dimmer" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-sm text-evari-text">
                      <span className="text-evari-dim">{s.icon}</span>
                      {s.label}
                    </span>
                    <span className="text-[11px] text-evari-dimmer block">
                      {s.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function InviteForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (email: string, fullName: string, role: UserRole, scopes: PermissionScope[]) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [scopes, setScopes] = useState<PermissionScope[]>(['today']);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    onSubmit(email.trim(), fullName.trim(), role, scopes);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="space-y-1 block">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Full name
        </span>
        <Input
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Jordan Reeves"
        />
      </label>
      <label className="space-y-1 block">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Email
        </span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@evari.cc"
        />
      </label>
      <ScopePicker
        role={role}
        scopes={scopes}
        onRoleChange={setRole}
        onScopesChange={setScopes}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!email.trim() || !fullName.trim()}
        >
          <Mail className="h-3 w-3" />
          Send invite
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  user,
  lockRole,
  onSubmit,
  onCancel,
}: {
  user: User;
  lockRole: boolean;
  onSubmit: (changes: Partial<User>) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [scopes, setScopes] = useState<PermissionScope[]>(user.scopes.filter((s) => s !== 'all'));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      role,
      scopes: role === 'super_admin' ? ['all'] : scopes,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="space-y-1 block">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Full name
        </span>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <label className="space-y-1 block">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Email
        </span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <ScopePicker
        role={role}
        scopes={scopes}
        onRoleChange={setRole}
        onScopesChange={setScopes}
        lockRole={lockRole}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary">
          Save changes
        </Button>
      </div>
    </form>
  );
}
