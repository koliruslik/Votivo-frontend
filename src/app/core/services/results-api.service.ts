import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PollResult } from '../models/poll-result';

@Injectable({ providedIn: 'root' })
export class ResultsApiService {
  private readonly http = inject(HttpClient);

  getResults(pollId: string): Observable<PollResult> {
    return this.http.get<PollResult>(`/api/v1/polls/${encodeURIComponent(pollId)}/results`);
  }
}
