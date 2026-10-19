// Institutions the user adds when theirs isn't in the card-art catalog.

import { customInstitutionId, isHexColor } from '../domain/cardCatalog';
import type { CustomInstitution } from '../domain/types';
import type { AppContext } from './context';

export async function customInstitutions(ctx: AppContext): Promise<CustomInstitution[]> {
  return (await ctx.repos.settings.get()).customInstitutions ?? [];
}

/** Create (or update the colour of) a custom institution; returns it. */
export async function saveCustomInstitution(ctx: AppContext, name: string, color: string): Promise<CustomInstitution> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('institution name required');
  const inst: CustomInstitution = { id: customInstitutionId(clean), name: clean, color: isHexColor(color) ? color.toLowerCase() : '#3a3a3a' };
  const list = (await customInstitutions(ctx)).filter((i) => i.id !== inst.id);
  await ctx.repos.settings.update({ customInstitutions: [...list, inst] });
  return inst;
}
