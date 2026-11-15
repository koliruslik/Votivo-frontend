import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DEMO_POLL_ID } from './core/data/demo-poll.service';
import { routes } from './app.routes';

describe('Results page', () => {
  let http: HttpTestingController;
  const url = `/api/v1/polls/${DEMO_POLL_ID}/results`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders results returned by the service using sample option labels', async () => {
    const harness = await RouterTestingHarness.create(`/polls/${DEMO_POLL_ID}/results`);
    expect(harness.routeNativeElement?.textContent).toContain('Loading results');
    http.expectOne(url).flush({
      pollId: DEMO_POLL_ID,
      totalVotes: 3,
      questions: [
        {
          questionId: '22222222-2222-4222-8222-222222222222',
          answeredVotes: 3,
          options: [
            {
              optionId: '33333333-3333-4333-8333-333333333333',
              votes: 2,
              percentage: 66.7,
            },
          ],
        },
      ],
    });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Morning');
    expect(harness.routeNativeElement?.textContent).toContain('66.7%');
    expect(harness.routeNativeElement?.querySelector('progress')?.value).toBe(66.7);
  });

  it('allows retry after a failed request and then renders the empty state', async () => {
    const harness = await RouterTestingHarness.create(`/polls/${DEMO_POLL_ID}/results`);
    http.expectOne(url).flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Results are unavailable');
    harness.routeNativeElement?.querySelector('button')?.click();
    http.expectOne(url).flush({ pollId: DEMO_POLL_ID, totalVotes: 0, questions: [] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('No responses are available');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
  });

  it('loads a new poll when only the route parameter changes', async () => {
    const harness = await RouterTestingHarness.create(`/polls/${DEMO_POLL_ID}/results`);
    http.expectOne(url).flush({ pollId: DEMO_POLL_ID, totalVotes: 0, questions: [] });
    const anotherPoll = '88888888-8888-4888-8888-888888888888';
    await harness.navigateByUrl(`/polls/${anotherPoll}/results`);
    http.expectOne(`/api/v1/polls/${anotherPoll}/results`).flush({
      pollId: anotherPoll,
      totalVotes: 0,
      questions: [],
    });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Poll results');
    expect(harness.routeNativeElement?.textContent).not.toContain('Sample poll.');
  });
});
