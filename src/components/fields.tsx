import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onCommit: (n: number) => void;
};

/** A number field that can be cleared while typing; a blank field counts as 0 once you leave it. */
export function NumberInput({ value, onCommit, onFocus, onBlur, ...rest }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={text}
      onFocus={e => {
        editing.current = true;
        onFocus?.(e);
      }}
      onChange={e => {
        const v = e.target.value;
        setText(v);
        if (v.trim() !== '' && Number.isFinite(Number(v))) onCommit(Number(v));
      }}
      onBlur={e => {
        editing.current = false;
        const n = Number(text);
        if (text.trim() === '' || !Number.isFinite(n)) {
          onCommit(0);
          setText('0');
        } else setText(String(n));
        onBlur?.(e);
      }}
    />
  );
}

/** Display figure printed as misregistered C/M/Y plates (Broadsheet .cmyk-num). */
export function PlateNumeral({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`cmyk-num ${className || ''}`}>
      <span className="paper">{children}</span>
      <span className="plate plate-c" aria-hidden="true">{children}</span>
      <span className="plate plate-m" aria-hidden="true">{children}</span>
      <span className="plate plate-y" aria-hidden="true">{children}</span>
    </div>
  );
}
