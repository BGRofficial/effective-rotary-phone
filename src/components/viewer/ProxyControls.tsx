import { useStudioStore } from '../../state/useStudioStore';
import type { ProxyKind } from '../../types';

interface Option {
  kind: ProxyKind;
  label: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  { kind: 'sphere', label: 'Stone' },
  { kind: 'cylinder', label: 'Branch' },
  { kind: 'mesh', label: 'Mesh' },
];

/** Minimal segmented control for switching the proxy primitive. */
export function ProxyControls() {
  const proxyKind = useStudioStore((state) => state.proxyKind);
  const setProxyKind = useStudioStore((state) => state.setProxyKind);
  const meshReady = useStudioStore(
    (state) => state.reconstruction.glbUrl !== null,
  );

  return (
    <div className="proxy-controls" role="radiogroup" aria-label="Proxy shape">
      {OPTIONS.map(({ kind, label }) => {
        const active = proxyKind === kind;
        const disabled = kind === 'mesh' && !meshReady;
        const className = [
          'proxy-controls__option',
          active ? 'is-active' : '',
          disabled ? 'is-disabled' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={disabled}
            disabled={disabled}
            className={className}
            onClick={() => !disabled && setProxyKind(kind)}
            title={
              disabled ? 'Reconstruct first to enable the mesh proxy' : undefined
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
