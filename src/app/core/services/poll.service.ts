import { Injectable } from '@angular/core';
import { Poll } from '../models/poll';

@Injectable({ providedIn: 'root' })
export class PollService {
  getPolls(): readonly Poll[] {
    return [];
  }
}
