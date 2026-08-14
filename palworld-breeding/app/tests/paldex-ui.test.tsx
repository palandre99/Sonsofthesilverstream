/** Paldex (merged collection) UI — import/export/filter behavior without a browser. */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PaldexPage } from '../src/modules/paldex';
import { BreedingEngine } from '../src/engine/formula';
import * as state from '../src/state';
import type { BreedingData } from '../src/engine/types';

// real data: the engine needs actual ranks for the "reachable" tile
const data = JSON.parse(
  readFileSync(join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const palsJson = JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, state.PalInfo> };

beforeEach(() => {
  cleanup();
  localStorage.clear();
  // wire the module state the way loadData would
  state.setEngine(new BreedingEngine(data));
  state.pals.value = palsJson.pals;
  state.box.value = {};
});

function openImport() {
  fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
  return document.querySelector('.importpanel textarea') as HTMLTextAreaElement;
}

describe('Paldex collection import', () => {
  it('imports a plain name list, case-insensitively, with gender suffixes', () => {
    render(<PaldexPage />);
    const ta = openImport();
    fireEvent.input(ta, { target: { value: 'anubis\nKatress ♀\nWIXEN ♂\nnot-a-pal' } });
    expect(document.querySelector('.importmeta')!.textContent).toContain('3 recognised');
    expect(document.querySelector('.importmeta')!.textContent).toContain('1 not recognised');
    fireEvent.click(screen.getByRole('button', { name: /Add 3 pals/ }));
    expect(state.box.value['Anubis']).toEqual({ m: true, f: true });
    expect(state.box.value['Katress']).toEqual({ m: false, f: true });
    expect(state.box.value['Wixen']).toEqual({ m: true, f: false });
  });

  it('merges duplicate lines with different genders into one entry', () => {
    render(<PaldexPage />);
    const ta = openImport();
    fireEvent.input(ta, { target: { value: 'Katress ♀\nKatress ♂' } });
    fireEvent.click(screen.getByRole('button', { name: /Add 1 pals/ }));
    expect(state.box.value['Katress']).toEqual({ m: true, f: true });
  });

  it('round-trips its own JSON backup', () => {
    state.box.value = { Anubis: { m: true, f: false }, Lamball: { m: true, f: true } };
    render(<PaldexPage />);
    const ta = openImport();
    const backup = JSON.stringify({ hatchlab: 1, box: state.box.value });
    // replace mode on an emptied box
    fireEvent.input(ta, { target: { value: backup } });
    const replace = document.querySelector('.importmeta input[type=checkbox]') as HTMLInputElement;
    fireEvent.click(replace);
    fireEvent.click(screen.getByRole('button', { name: /Replace collection/ }));
    expect(state.box.value).toEqual({ Anubis: { m: true, f: false }, Lamball: { m: true, f: true } });
  });

  it('merges rather than overwrites by default', () => {
    state.box.value = { Lamball: { m: true, f: false } };
    render(<PaldexPage />);
    const ta = openImport();
    fireEvent.input(ta, { target: { value: 'Lamball ♀' } });
    fireEvent.click(screen.getByRole('button', { name: /Add 1 pals/ }));
    expect(state.box.value['Lamball']).toEqual({ m: true, f: true });
  });
});

describe('Paldex import edge cases', () => {
  it('never resurrects species from false/null JSON values', () => {
    render(<PaldexPage />);
    const ta = openImport();
    const evil = JSON.stringify({ box: { Anubis: false, Lamball: null, Cattiva: true } });
    fireEvent.input(ta, { target: { value: evil } });
    // only Cattiva (true) is recognised as owned
    expect(document.querySelector('.importmeta')!.textContent).toContain('1 recognised');
    fireEvent.click(screen.getByRole('button', { name: /Add 1 pals/ }));
    expect(state.box.value['Anubis']).toBeUndefined();
    expect(state.box.value['Lamball']).toBeUndefined();
    expect(state.box.value['Cattiva']).toEqual({ m: true, f: true });
  });

  it('ignores an {m:false, f:false} entry instead of importing it', () => {
    render(<PaldexPage />);
    const ta = openImport();
    fireEvent.input(ta, { target: { value: JSON.stringify({ Anubis: { m: false, f: false } }) } });
    expect(document.querySelector('.importmeta')!.textContent).toContain('0 recognised');
  });
});

describe('Paldex collection clear', () => {
  it('requires explicit confirmation and then empties the box', () => {
    state.box.value = { Anubis: { m: true, f: true } };
    render(<PaldexPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear…' }));
    expect(document.body.textContent).toContain('Clear the whole collection?');
    fireEvent.click(screen.getByRole('button', { name: /Yes, clear 1 species/ }));
    expect(state.box.value).toEqual({});
  });
});

describe('Paldex collection filters', () => {
  it('filters to one-gender-only species', () => {
    state.box.value = {
      Anubis: { m: true, f: false },
      Lamball: { m: true, f: true },
    };
    render(<PaldexPage />);
    fireEvent.click(screen.getByRole('button', { name: 'One gender only' }));
    const rows = document.querySelectorAll('.boxrow');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Anubis');
  });

  it('bulk-owns everything the current filter shows', () => {
    render(<PaldexPage />);
    const search = screen.getByLabelText('Search Paldex') as HTMLInputElement;
    fireEvent.input(search, { target: { value: 'Jolthog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Own all shown' }));
    // Jolthog + Jolthog Cryst both exist in 1.0
    expect(state.box.value['Jolthog']).toEqual({ m: true, f: true });
    expect(state.box.value['Jolthog Cryst']).toEqual({ m: true, f: true });
  });

  it('requires a second click to bulk un-own', () => {
    state.box.value = { Jolthog: { m: true, f: true } };
    render(<PaldexPage />);
    const search = screen.getByLabelText('Search Paldex') as HTMLInputElement;
    fireEvent.input(search, { target: { value: 'Jolthog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Un-own all shown' }));
    // first click only arms — nothing deleted yet
    expect(state.box.value['Jolthog']).toEqual({ m: true, f: true });
    fireEvent.click(screen.getByRole('button', { name: /Really un-own/ }));
    expect(state.box.value['Jolthog']).toBeUndefined();
  });
});
