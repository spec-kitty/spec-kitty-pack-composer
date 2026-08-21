import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ErrorState } from './error-state';

describe('ErrorState', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorState],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the message with an alert role and a Retry button by default', () => {
    const fixture = TestBed.createComponent(ErrorState);
    fixture.componentRef.setInput('message', 'The request was aborted');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('The request was aborted');

    const button = el.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Retry');
  });

  it('emits retry when the button is clicked', () => {
    const fixture = TestBed.createComponent(ErrorState);
    fixture.componentRef.setInput('message', 'Failed to load');
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.retry.subscribe(() => {
      emitted = true;
    });

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    button?.dispatchEvent(new Event('click', { bubbles: true }));
    fixture.detectChanges();

    expect(emitted).toBe(true);
  });

  it('hides the Retry button when showRetry is false', () => {
    const fixture = TestBed.createComponent(ErrorState);
    fixture.componentRef.setInput('message', 'Failed to load');
    fixture.componentRef.setInput('showRetry', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
  });
});
