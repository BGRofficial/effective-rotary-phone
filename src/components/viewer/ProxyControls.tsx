import { useStudioStore } from '../../state/useStudioStore';
import type { ProxyKind } from '../../types';

const OPTIONS: ReadonlyArray<{ kind: ProxyKind; label: string }> = [
  { kind: 'sphere', label: 'Stone' },
  { kind: 'cylinder', label: 'Branch' },
];

/** Minimal segmented control for switching the proxy primitive. */
export function ProxyControls() {
  const proxyKind = useStudioStore((state) => state.proxyKind);
  const setProxyKind = useStudioStore((state) => state.setProxyKind);

  return (
    <div className="proxy-controls" role="radiogroup" aria-label="Proxy shape">
      {OPTIONS.map(({ kind, label }) => {
        const active = proxyKind === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={active}
            className={
              active
                ? 'proxy-controls__option is-active'
                : 'proxy-controls__option'
            }
            onClick={() => setProxyKind(kind)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
