import { Position } from 'vscode';
import { configuration } from './../../../configuration/configuration';
import { Marker } from './types';

export class MarkerGenerator {
  private matchesCount: number;
  private keyTable: string[];
  private prefixKeyTable: string[];

  constructor(matchesCount: number, nextKeys: Set<string>) {
    this.matchesCount = matchesCount;
    this.keyTable = this.getKeyTable().filter((key) => !nextKeys.has(key));
    if (nextKeys.size > 0) {
      this.prefixKeyTable = [];
    } else {
      this.prefixKeyTable = this.createPrefixKeyTable();
    }
  }

  public generateMarker(index: number, markerPosition: Position): Marker | null {
    const { keyTable, prefixKeyTable } = this;

    if (index >= keyTable.length - prefixKeyTable.length) {
      const remainder = index - (keyTable.length - prefixKeyTable.length);
      const currentStep = Math.floor(remainder / keyTable.length) + 1;
      if (currentStep > prefixKeyTable.length) {
        return null;
      } else {
        const prefix = prefixKeyTable[currentStep - 1];
        const label = keyTable[remainder % keyTable.length];
        return {
          name: prefix + label,
          position: markerPosition,
        };
      }
    } else {
      return {
        name: keyTable[index],
        position: markerPosition,
      };
    }
  }

  private createPrefixKeyTable(): string[] {
    const totalRemainder = Math.max(this.matchesCount - this.keyTable.length, 0);
    const totalSteps = Math.ceil(totalRemainder / this.keyTable.length);
    const reversed = this.keyTable.slice().reverse();
    const count = Math.min(totalSteps, reversed.length);
    return reversed.slice(0, count);
  }

  /**
   * The key sequence for marker name generation
   */
  private getKeyTable(): string[] {
    if (configuration.easymotionKeys) {
      return configuration.easymotionKeys.split('');
    } else {
      return 'hklyuiopnm,qwertzxcvbasdgjf;'.split('');
    }
  }
}
