import { forwardRef } from 'react';

export const Input = forwardRef(function Input({ 
  label, 
  error, 
  required, 
  className = '', 
  ...props 
}, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="label-field flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        className={`
          input-field
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${props.id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export const Select = forwardRef(function Select({ 
  label, 
  error, 
  required, 
  options = [], 
  placeholder = 'Seleccionar...',
  className = '', 
  ...props 
}, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="label-field flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        className={`
          input-field appearance-none bg-white
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-500" role="alert">{error}</p>
      )}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ 
  label, 
  error, 
  required, 
  rows = 3, 
  className = '', 
  ...props 
}, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="label-field flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`
          input-field resize-y
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500" role="alert">{error}</p>
      )}
    </div>
  );
});

export const FileInput = forwardRef(function FileInput({ 
  label, 
  error, 
  required, 
  accept, 
  onChange,
  preview,
  className = '', 
  ...props 
}, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="label-field flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type="file"
          accept={accept}
          onChange={onChange}
          required={required}
          aria-describedby={error ? `${props.id}-error` : undefined}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus:opacity-100 focus:static focus:h-auto focus:p-2 focus:bg-white focus:text-sm"
          {...props}
        />
        <div className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${error ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-unal-primary hover:bg-gray-50'}
        `}>
          <label htmlFor={props.id} className="cursor-pointer">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-2 text-sm text-unal-secondary">
              <span className="font-medium text-unal-primary">Haz clic para subir</span> o arrastra y suelta
            </p>
            <p className="mt-1 text-xs text-unal-secondary-light">
              Formatos: {accept || 'JPG, PNG, PDF'} • Máx. 10MB
            </p>
          </label>
        </div>
      </div>
      {preview && (
        <div className="mt-3 relative">
          <img 
            src={preview} 
            alt="Vista previa" 
            className="max-h-40 rounded-lg border border-gray-200"
          />
        </div>
      )}
      {error && (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-red-500" role="alert">{error}</p>
      )}
    </div>
  );
});

export const Checkbox = forwardRef(function Checkbox({ 
  label, 
  className = '', 
  ...props 
}, ref) {
  return (
    <div className="flex items-start gap-3">
      <input
        ref={ref}
        type="checkbox"
        className="mt-1 w-4 h-4 text-unal-primary border-gray-300 rounded focus:ring-unal-primary focus:ring-2"
        {...props}
      />
      {label && (
        <label htmlFor={props.id} className="text-sm text-unal-secondary cursor-pointer">
          {label}
        </label>
      )}
    </div>
  );
});

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
      {message}
    </div>
  );
}