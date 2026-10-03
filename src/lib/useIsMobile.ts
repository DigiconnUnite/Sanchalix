import { useMediaQuery } from './useMediaQuery';

// Cloudscape's xs breakpoint, below which collections switch from Table to Cards.
export const useIsMobile = () => useMediaQuery('(max-width: 688px)');
