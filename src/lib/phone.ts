export const formatPhone = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
