'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Upload, X } from 'lucide-react';
import { useTheme, type Theme } from './ThemeProvider';

/**
 * Single-box drag-and-drop logo uploader. One instance per theme. The whole
 * rounded tile IS the drop zone — clicking anywhere inside opens the file
 * picker, and the native <input type="file"> is visually hidden (display:
 * none on the input itself so the "Choose File" chrome can't leak through).
 *
 * Empty state:  centered upload icon + "Drop an image or click" label.
 * Filled state: the uploaded logo fills the tile (on its matching theme
 *                background so a white mark dropped into the dark slot
 *                still reads correctly), with a small ✕ to clear.
 *
 * Save is implicit on upload — the moment a valid file lands it commits
 * through ThemeProvider.setLogo (which persists to localStorage), and a
 * green "Saved" check flashes in the header for 1.8s.
 */
export function LogoUploader({
  which,
  label,
}: {
  which: Theme;
  label: string;
}) {
  const { logoLight, logoDark, setLogo } = useTheme();
  const current = which === 'dark' ? logoDark : logoLight;

  const [dragOver, setDragOver] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  function flashSaved() {
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1800);
  }

  function ingestFile(file: File | null | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    // Cap at ~1MB to keep localStorage happy.
    if (file.size > 1_000_000) {
      setError('Logo is too large (max 1MB). Try an SVG or optimised PNG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:image/')) {
        setLogo(which, result);
        flashSaved();
      } else {
        setError('Could not read that file.');
      }
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    ingestFile(file);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setLogo(which, null);
    setError(null);
    setJustSaved(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function openPicker() {
    inputRef.current?.click();
  }

  // Preview backdrop matches the mode the logo is for so a white mark
  // dropped into the dark-mode slot still reads correctly, even while
  // you're currently viewing light mode.
  const previewBg = which === 'dark' ? 'rgb(20 20 20)' : 'rgb(245 245 245)';
  const iconColor = which === 'dark' ? 'rgb(180 180 180)' : 'rgb(90 90 90)';
  const helperColor = which === 'dark' ? 'rgb(150 150 150)' : 'rgb(110 110 110)';

  const state: 'empty' | 'uploaded' = current ? 'uploaded' : 'empty';

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          {label}
        </span>
        <span className="text-evari-dim font-mono inline-flex items-center gap-1">
          {justSaved ? (
            <>
              <Check className="h-3 w-3 text-evari-success" />
              SAVED
            </>
          ) : state === 'uploaded' ? (
            'UPLOADED'
          ) : (
            'NONE'
          )}
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={
          'relative flex flex-col items-center justify-center gap-1.5 rounded-md cursor-pointer transition-all overflow-hidden ' +
          (dragOver ? 'outline outline-2 outline-evari-gold' : '')
        }
        style={{
          background: previewBg,
          height: 96,
          width: '100%',
        }}
      >
        {/* Native file input — fully hidden. Clicks on the outer div open
            it via inputRef.current.click(). We use inline `display: none`
            rather than `sr-only`/`hidden` utilities so nothing in the
            Tailwind build can accidentally re-surface the default
            "Choose File" chrome. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => ingestFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />

        {state === 'uploaded' ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current ?? ''}
              alt={`${which} logo`}
              className="max-h-16 max-w-[80%] object-contain"
              draggable={false}
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-6 w-6 rounded-md bg-black/40 hover:bg-black/60 text-white transition-colors"
              aria-label={`Remove ${which} logo`}
              title="Remove logo"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" style={{ color: iconColor }} />
            <div
              className="text-xs font-medium"
              style={{ color: iconColor }}
            >
              Drop an image or click
            </div>
            <div
              className="text-[10px]"
              style={{ color: helperColor }}
            >
              SVG or PNG, ≤1MB
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className="text-[11px] text-evari-danger">{error}</div>
      ) : null}
    </div>
  );
}
