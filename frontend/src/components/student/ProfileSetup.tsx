import { FormEvent, useEffect, useState } from 'react';
import FallbackAvatar, { type AvatarKey } from '../FallbackAvatar';
import { apiFetch } from '../../lib/api';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { AccentTheme, UserProfile, Achievement } from '../../types/app';
import { applyAccentTheme } from '../../lib/theme';

const avatarOptions: { id: AvatarKey; label: string }[] = [
  { id: 'orbit', label: 'Órbita' },
  { id: 'spark', label: 'Faísca' },
  { id: 'books', label: 'Cadernos' },
  { id: 'prism', label: 'Prisma' },
  { id: 'trail', label: 'Trilha' },
];

const accentOptions: { id: AccentTheme; label: string; color: string }[] = [
  { id: 'wine', label: 'Vinho', color: '#c7193b' },
  { id: 'ocean', label: 'Oceano', color: '#176b87' },
  { id: 'forest', label: 'Floresta', color: '#2f6f4e' },
  { id: 'amber', label: 'Âmbar', color: '#995216' },
];

/**
 * Junta as escolhas visuais em uma única etapa curta. A prévia usa o mesmo
 * componente de avatar que aparece depois no painel.
 */
export function ProfileSetup({
  profile,
  achievements,
  canCancel,
  onCancel,
  onSave,
}: {
  profile: UserProfile;
  achievements: Achievement[];
  canCancel: boolean;
  onCancel: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const initialBadge = achievements.some(
    (achievement) => achievement.id === profile.featuredBadgeId,
  )
    ? profile.featuredBadgeId
    : null;
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(profile.avatarKey);
  const [featuredBadgeId, setFeaturedBadgeId] = useState<string | null>(initialBadge);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(profile.accentTheme);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const featuredBadge = achievements.find((achievement) => achievement.id === featuredBadgeId);

  // A troca aparece na hora para o estudante decidir olhando o resultado real.
  useEffect(() => applyAccentTheme(accentTheme), [accentTheme]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (isSupabaseConfigured) {
        const response = await apiFetch('/student/profile-personalization', {
          method: 'PUT',
          body: JSON.stringify({
            avatar_key: avatarKey,
            featured_badge_id: featuredBadgeId,
            accent_theme: accentTheme,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || 'Não foi possível salvar sua personalização.');
        }
      }
      onSave({
        ...profile,
        avatarKey,
        featuredBadgeId,
        accentTheme,
        profileSetupComplete: true,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar sua personalização.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="profile-content narrow profile-setup-page"
      aria-labelledby="profile-setup-title"
    >
      <header className="profile-setup-heading">
        <p className="eyebrow">SEU PERFIL, SEU JEITO</p>
        <h1 id="profile-setup-title">Escolha como você aparece.</h1>
        <p>Monte seu avatar, destaque uma conquista e escolha a cor que acompanha sua jornada.</p>
      </header>

      <div className="profile-setup-layout">
        <aside className="profile-preview" aria-label="Prévia do perfil">
          <div className="profile-preview-avatar">
            <FallbackAvatar name={profile.name} avatarKey={avatarKey} size={128} />
            {featuredBadge && (
              <span className="featured-badge preview-badge" title={featuredBadge.title}>
                {featuredBadge.icon}
              </span>
            )}
          </div>
          <strong>{profile.name}</strong>
          <span>{profile.grade}</span>
          <small>
            {featuredBadge ? `Em destaque: ${featuredBadge.title}` : 'Sem insígnia em destaque'}
          </small>
        </aside>

        <form className="profile-setup-form" onSubmit={saveProfile}>
          <fieldset className="profile-choice-group">
            <legend>Escolha seu avatar</legend>
            <div className="avatar-picker">
              {avatarOptions.map((option) => (
                <label
                  className={avatarKey === option.id ? 'avatar-option selected' : 'avatar-option'}
                  key={option.id}
                >
                  <input
                    type="radio"
                    name="avatar"
                    value={option.id}
                    checked={avatarKey === option.id}
                    onChange={() => setAvatarKey(option.id)}
                  />
                  <FallbackAvatar name={profile.name} avatarKey={option.id} size={48} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="profile-choice-group">
            <legend>Insígnia em destaque</legend>
            <p className="choice-help">Você só pode usar conquistas que já desbloqueou.</p>
            <div className="badge-picker">
              <label
                className={featuredBadgeId === null ? 'badge-option selected' : 'badge-option'}
              >
                <input
                  type="radio"
                  name="badge"
                  checked={featuredBadgeId === null}
                  onChange={() => setFeaturedBadgeId(null)}
                />
                <span aria-hidden="true">○</span>
                <strong>Sem destaque</strong>
              </label>
              {achievements.map((achievement) => (
                <label
                  className={
                    featuredBadgeId === achievement.id ? 'badge-option selected' : 'badge-option'
                  }
                  key={achievement.id}
                >
                  <input
                    type="radio"
                    name="badge"
                    value={achievement.id}
                    checked={featuredBadgeId === achievement.id}
                    onChange={() => setFeaturedBadgeId(achievement.id)}
                  />
                  <span aria-hidden="true">{achievement.icon}</span>
                  <strong>{achievement.title}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="profile-choice-group">
            <legend>Cor de destaque</legend>
            <div className="accent-picker">
              {accentOptions.map((option) => (
                <label
                  className={accentTheme === option.id ? 'accent-option selected' : 'accent-option'}
                  key={option.id}
                >
                  <input
                    type="radio"
                    name="accent"
                    value={option.id}
                    checked={accentTheme === option.id}
                    onChange={() => setAccentTheme(option.id)}
                  />
                  <span style={{ backgroundColor: option.color }} aria-hidden="true" />
                  <strong>{option.label}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          {message && (
            <p className="form-message" role="alert">
              {message}
            </p>
          )}
          <div className="profile-setup-actions">
            {canCancel && (
              <button type="button" className="outline-button" onClick={onCancel} disabled={saving}>
                Cancelar
              </button>
            )}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
