'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { cn, formatBytes, isAcceptedFile, maxUploadBytes } from '@/lib/utils';

export interface DropzoneFile {
  file: File;
  pageCount?: number;
}

export function UploadDropzone({
  label,
  accentLabel,
  value,
  onChange,
  disabled,
}: {
  label: string;
  accentLabel: string;
  value: DropzoneFile | null;
  onChange: (file: DropzoneFile | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!isAcceptedFile(file)) {
        setError('Please upload a PDF, PNG, JPG, or JPEG file.');
        return;
      }
      if (file.size > maxUploadBytes()) {
        setError(`File exceeds the ${process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10}MB limit.`);
        return;
      }
      setError(null);
      onChange({ file });
    },
    [onChange]
  );

  if (value) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-ink-900/10 bg-white p-3">
        <div className="flex items-center gap-3 rounded-xl bg-canvas-50 p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-danger-DEFAULT text-[10px] font-bold text-white">
            {fileKindLabel(value.file)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{value.file.name}</p>
            <p className="text-xs text-ink-400">
              {formatBytes(value.file.size)}
              {value.pageCount ? ` • ${value.pageCount} Page${value.pageCount === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          {!disabled && (
            <button
              aria-label="Remove file"
              onClick={() => onChange(null)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 text-white hover:bg-ink-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
          dragOver ? 'border-brand-400 bg-brand-50' : 'border-ink-900/15 bg-white hover:border-ink-900/25',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-canvas-100">
          <Upload size={18} className="text-ink-700" />
        </span>
        <span className="text-[15px] font-semibold text-ink-900">
          Upload <span className="text-brand-500 underline">{accentLabel}</span>
        </span>
        <span className="text-xs text-ink-400">
          Max {process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10}MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="px-1 text-xs font-medium text-danger-DEFAULT">{error}</p>}
    </div>
  );
}

function fileKindLabel(file: File): string {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'PDF';
  return 'IMG';
}
