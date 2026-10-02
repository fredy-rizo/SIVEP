let toastContainer = null;

function createContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function toast({ title, description, variant = 'default' }) {
  const container = createContainer();
  
  const toastEl = document.createElement('div');
  toastEl.className = `
    flex items-start gap-3 p-4 rounded-lg shadow-lg min-w-[300px] max-w-md
    bg-white border-l-4 animate-slide-in
    ${variant === 'success' ? 'border-green-500' : ''}
    ${variant === 'error' ? 'border-red-500' : ''}
    ${variant === 'warning' ? 'border-yellow-500' : ''}
    ${variant === 'info' ? 'border-blue-500' : ''}
  `;
  
  const iconMap = {
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info'
  };
  
  const iconName = iconMap[variant] || 'info';
  
  toastEl.innerHTML = `
    <div class="flex-shrink-0 mt-0.5 text-${variant === 'success' ? 'green' : variant === 'error' ? 'red' : variant === 'warning' ? 'yellow' : 'blue'}-500">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${iconName === 'check-circle' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />' : ''}
        ${iconName === 'x-circle' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />' : ''}
        ${iconName === 'alert-triangle' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />' : ''}
        ${iconName === 'info' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />' : ''}
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      ${title ? `<p class="text-sm font-semibold text-unal-secondary">${title}</p>` : ''}
      ${description ? `<p class="text-sm text-unal-secondary-light mt-1">${description}</p>` : ''}
    </div>
    <button class="flex-shrink-0 text-gray-400 hover:text-gray-600" onclick="this.parentElement.remove()">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;
  
  container.appendChild(toastEl);
  
  setTimeout(() => {
    toastEl.style.animation = 'slide-out 0.3s ease-in forwards';
    setTimeout(() => toastEl.remove(), 300);
  }, 5000);
  
  return { dismiss: () => toastEl.remove() };
}

toast.success = (title, description) => toast({ title, description, variant: 'success' });
toast.error = (title, description) => toast({ title, description, variant: 'error' });
toast.warning = (title, description) => toast({ title, description, variant: 'warning' });
toast.info = (title, description) => toast({ title, description, variant: 'info' });

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    .animate-slide-in { animation: slide-in 0.3s ease-out; }
  `;
  document.head.appendChild(style);
}

export default toast;