import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DISCLAIMER_TEXT, DISCLAIMER_TEXT_EN, DisclaimerBanner } from '../components/disclaimer';

describe('disclaimer — legally required framing', () => {
  it('the shared disclaimer constant carries the required wording', () => {
    expect(DISCLAIMER_TEXT).toContain('仅供参考');
    expect(DISCLAIMER_TEXT).toContain('不构成');
    expect(DISCLAIMER_TEXT).toContain('食用建议');
  });

  it('the English variant carries the same safety framing', () => {
    expect(DISCLAIMER_TEXT_EN).toMatch(/reference only/i);
    expect(DISCLAIMER_TEXT_EN).toMatch(/never eat/i);
  });

  it('the banner component renders the disclaimer text server-side (zh default)', () => {
    const html = renderToString(<DisclaimerBanner />);
    expect(html).toContain(DISCLAIMER_TEXT);
    expect(html).toContain('mycoguard-disclaimer');
  });
});
