import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PollService } from '../../core/services/poll.service';
import { PollEditor } from './poll-editor';
import { unsavedGuard } from '../../core/auth/auth.guard';

const draft = (id: string) => ({
  id,
  title: id,
  description: '',
  status: 'DRAFT',
  blocked: false,
  accessType: 'PUBLIC' as const,
  anonymous: false,
  allowVoteChange: true,
  questions: [
    { text: 'Where?', type: 'SINGLE' as const, options: [{ text: 'Cafe' }, { text: 'Park' }] },
  ],
});
describe('Poll editor', () => {
  let params: BehaviorSubject<Map<string, string>>;
  let route: {
    paramMap: ReturnType<typeof params.asObservable>;
    snapshot: { paramMap: Map<string, string> };
  };
  let api: { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    params = new BehaviorSubject(new Map<string, string>());
    route = { paramMap: params.asObservable(), snapshot: { paramMap: params.value } };
    api = { get: vi.fn(), save: vi.fn() };
    TestBed.configureTestingModule({
      imports: [PollEditor],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: PollService, useValue: api },
      ],
    });
  });
  it('disables inputs and navigation while saving, then leaves without a discard prompt', async () => {
    let finish!: (value: unknown) => void;
    api.save.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const fixture = TestBed.createComponent(PollEditor);
    const page = fixture.componentInstance;
    const { id, status, blocked, ...input } = draft('New poll');
    page.form.set(input);
    page.touch();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pending = page.save(new Event('submit'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#poll-title').matches(':disabled')).toBe(true);
    expect(unsavedGuard(page, null!, null!, null!)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    finish({ id: 'created' });
    await pending;
    expect(page.hasUnsavedChanges()).toBe(false);
    expect(page.isSaving()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/polls', 'created']);
    expect(unsavedGuard(page, null!, null!, null!)).toBe(true);
    confirm.mockRestore();
  });
  it('does not overwrite a new draft with a late response for the previous route', async () => {
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    api.get.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          if (id === 'first') finishFirst = resolve;
          else finishSecond = resolve;
        }),
    );
    route.snapshot.paramMap = new Map([['id', 'first']]);
    params.next(route.snapshot.paramMap);
    const fixture = TestBed.createComponent(PollEditor);
    const page = fixture.componentInstance;
    route.snapshot.paramMap = new Map([['id', 'second']]);
    params.next(route.snapshot.paramMap);
    finishSecond(draft('second'));
    await vi.waitFor(() => expect(page.ready()).toBe(true));
    finishFirst(draft('first'));
    await Promise.resolve();
    expect(page.id).toBe('second');
    expect(page.form().title).toBe('second');
    api.save.mockResolvedValue({ id: 'second' });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await page.save(new Event('submit'));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'second' }), 'second');
  });
  it('keeps edits after a failed save unless reloading is explicitly confirmed', async () => {
    route.snapshot.paramMap = new Map([['id', 'draft']]);
    params.next(route.snapshot.paramMap);
    api.get.mockResolvedValue(draft('draft'));
    const fixture = TestBed.createComponent(PollEditor);
    const page = fixture.componentInstance;
    await vi.waitFor(() => expect(page.ready()).toBe(true));
    page.update('title', 'Unsaved title');
    api.save.mockRejectedValue(new Error('Unavailable'));
    await page.save(new Event('submit'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await page.reloadDraft();
    expect(page.form().title).toBe('Unsaved title');
    expect(api.get).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await page.reloadDraft();
    expect(page.form().title).toBe('draft');
    expect(page.hasUnsavedChanges()).toBe(false);
    confirm.mockRestore();
  });
});
