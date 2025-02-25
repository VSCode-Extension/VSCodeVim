import { configuration } from '../../../configuration/configuration';

export function useSmartQuotes(): boolean {
  return (
    (configuration.targets.enable === true && configuration.targets.smartQuotes.enable !== false) ||
    (configuration.targets.enable === undefined &&
      configuration.targets.smartQuotes.enable === true)
  );
}

export function bracketObjectsEnabled(): boolean {
  return (
    (configuration.targets.enable === true &&
      configuration.targets.bracketObjects.enable !== false) ||
    (configuration.targets.enable === undefined &&
      configuration.targets.bracketObjects.enable === true)
  );
}

export function separatorObjectsEnabled(): boolean {
  return (
    (configuration.targets.enable === true &&
      configuration.targets.separatorObjects.enable !== false) ||
    (configuration.targets.enable === undefined &&
      configuration.targets.separatorObjects.enable === true)
  );
}
