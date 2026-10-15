import React from 'react';
import paths from './icons.json';
export type PuffIconName = keyof typeof paths;
export function PuffIcon({ name, size = 24, ...props }: React.SVGProps<SVGSVGElement> & { name: PuffIconName; size?: number | string }) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} dangerouslySetInnerHTML={{ __html: paths[name] }} />;
}
