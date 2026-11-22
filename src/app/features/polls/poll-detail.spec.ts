import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError, PollService } from '../../core/services/poll.service';
import { PollDetail } from './poll-detail';
import { BehaviorSubject } from 'rxjs';

const poll = {
  id: 'poll',
  title: 'Team lunch',
  ownerId: 'owner',
  status: 'PUBLISHED',
  anonymous: false,
  allowVoteChange: true,
  questions: [
    {
      id: 'one',
      text: 'Where?',
      type: 'SINGLE',
      options: [
        { id: 'a', text: 'Cafe' },
        { id: 'b', text: 'Office' },
      ],
    },
    {
      id: 'two',
      text: 'Which days?',
      type: 'MULTIPLE',
      options: [
        { id: 'c', text: 'Monday' },
        { id: 'd', text: 'Friday' },
      ],
    },
  ],
};
describe('Voting', () => {
  let signedIn: ReturnType<typeof signal<boolean>>;
  let params: BehaviorSubject<Map<string, string>>;
  let route: {
    paramMap: ReturnType<typeof params.asObservable>;
    snapshot: { paramMap: Map<string, string> };
  };
  let api: {
    get: ReturnType<typeof vi.fn>;
    voteStatus: ReturnType<typeof vi.fn>;
    vote: ReturnType<typeof vi.fn>;
    results: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    signedIn = signal(true);
    params = new BehaviorSubject(new Map([['id', 'poll']]));
    route = { paramMap: params.asObservable(), snapshot: { paramMap: params.value } };
    api = {
      get: vi.fn().mockResolvedValue(poll),
      voteStatus: vi.fn().mockResolvedValue({ voted: false }),
      vote: vi.fn().mockResolvedValue({}),
      results: vi.fn().mockResolvedValue({ totalVotes: 1, questions: [] }),
    };
    TestBed.configureTestingModule({
      imports: [PollDetail],
      providers: [
        provideRouter([]),
        { provide: PollService, useValue: api },
        {
          provide: AuthService,
          useValue: { authenticated: signedIn, userId: () => 'voter', isAdmin: () => false },
        },
        {
          provide: ActivatedRoute,
          useValue: route,
        },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(PollDetail);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('requires all questions, then sends single and multiple choices together', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    page.select('one', 'a', false);
    await page.submit(new Event('submit'));
    expect(api.vote).not.toHaveBeenCalled();
    expect(page.voteError()).toContain('every question');
    page.select('two', 'c', true);
    page.select('two', 'd', true);
    await page.submit(new Event('submit'));
    expect(api.vote).toHaveBeenCalledWith(
      'poll',
      [
        { question_id: 'one', option_ids: ['a'] },
        { question_id: 'two', option_ids: ['c', 'd'] },
      ],
      false,
    );
    expect(page.status()?.voted).toBe(true);
    expect(page.tab()).toBe('results');
  });
  it('keeps an anonymous prior vote locked and hides edit and withdraw controls', async () => {
    api.get.mockResolvedValue({ ...poll, anonymous: true, allowVoteChange: false });
    api.voteStatus.mockResolvedValue({ voted: true });
    const fixture = await create();
    expect(fixture.componentInstance.editableVote()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Edit response');
    expect(fixture.nativeElement.textContent).not.toContain('Withdraw my vote');
  });
  it('does not enable voting when participation status could not be checked', async () => {
    api.voteStatus.mockRejectedValue(new Error('Unavailable'));
    const fixture = await create();
    expect(fixture.componentInstance.editableVote()).toBe(false);
    expect(fixture.componentInstance.voteError()).toBe('Unavailable');
  });
  it('does not mistake a missing poll projection for an uncast vote', async () => {
    api.voteStatus.mockRejectedValue(new ApiError(404, 'Not found'));
    const fixture = await create();
    expect(fixture.componentInstance.editableVote()).toBe(false);
    expect(fixture.componentInstance.voteError()).toContain('still syncing');
  });
  it('locks the ballot when the session expires', async () => {
    const fixture = await create();
    expect(fixture.componentInstance.editableVote()).toBe(true);
    signedIn.set(false);
    expect(fixture.componentInstance.editableVote()).toBe(false);
  });
  it('loads a new poll’s results while discarding the previous poll’s pending response', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    api.results.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          if (id === 'poll') finishOld = resolve;
          else finishNew = resolve;
        }),
    );
    page.showResults();
    api.get.mockResolvedValue({ ...poll, id: 'other', status: 'CLOSED' });
    route.snapshot.paramMap = new Map([['id', 'other']]);
    params.next(route.snapshot.paramMap);
    await vi.waitFor(() => expect(api.results).toHaveBeenCalledWith('other'));
    finishOld({ pollId: 'poll', totalVotes: 10, questions: [] });
    await Promise.resolve();
    expect(page.resultsLoading()).toBe(true);
    finishNew({ pollId: 'other', totalVotes: 2, questions: [] });
    await vi.waitFor(() => expect(page.results()?.pollId).toBe('other'));
    expect(page.resultsLoading()).toBe(false);
  });
});
