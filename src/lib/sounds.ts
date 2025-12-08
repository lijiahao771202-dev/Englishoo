/**
 * @module Source of truth for sound effects
 * @description Provides sound playback functions. Currently placeholders as assets are missing.
 * @author Trae-Architect
 */

const logSound = (name: string) => {
    console.log(`[Sound] Playing: ${name}`);
};

export const playClickSound = () => logSound('Click');
export const playSuccessSound = () => logSound('Success');
export const playFailSound = () => logSound('Fail');
export const playPassSound = () => logSound('Pass');
export const playSpellingSuccessSound = () => logSound('Spelling Success');
