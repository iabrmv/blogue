export function formatDate(dateString: string | Date): Date {
  return new Date(dateString);
}

export function formatDateToISO(dateString: string | Date): string {
  return new Date(dateString).toISOString();
}

export function formatDateToLocal(dateString: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Date(dateString).toLocaleDateString('en-US', options);
}