import { describe, expect, it } from 'bun:test';

import { exposedIn, iosProps } from './exposure';

/** A host holding `html`, as react-native-web draws a screen into the document. */
const drawn = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return exposedIn(host);
};

const names = (html: string) => [...drawn(html).labels].toSorted();

describe("iOS's tree of a drawn screen", () => {
  it('names a button by its label alone: About relabels Done as Close', () => {
    expect(
      names('<div role="button" aria-label="Close" tabindex="0"><div dir="auto">Done</div></div>'),
    ).toEqual(['Close']);
  });

  it('names a tab by its label alone: the Sections tab relabelled Sektions', () => {
    expect(
      names(
        '<div role="tab" aria-label="Sektions" tabindex="0"><div dir="auto">Sections</div></div>',
      ),
    ).toEqual(['Sektions']);
  });

  it('names an unlabelled button by its Texts, and a Text by its runs run on', () => {
    const host = document.createElement('div');
    const title = document.createElement('div');
    title.setAttribute('dir', 'auto');
    title.append('Sections', ', all at once');
    host.append(title);
    expect([...exposedIn(host).labels]).toEqual(['Sections, all at once']);
    expect(
      names(
        '<div tabindex="0"><div dir="auto">Open</div><div><div dir="auto">player</div></div></div>',
      ),
    ).toEqual(['Open player']);
  });

  it('keeps the testIDs under an element, named as the element is', () => {
    const tree = drawn(
      '<div data-ios="element" aria-label="the line" data-testid="line"><div dir="auto" data-testid="syllable-1-1-1">a</div></div>',
    );
    expect([...tree.ids].toSorted()).toEqual(['line', 'syllable-1-1-1']);
    expect([...tree.labels]).toEqual(['the line']);
  });

  it('holds nothing under a hidden view, and no name for a Text marked not accessible', () => {
    const tree = drawn(
      '<div aria-hidden="true" data-testid="pin"><div role="heading" aria-label="A topic" dir="auto">A topic</div></div><div dir="auto" data-ios="none">quiet</div>',
    );
    expect([...tree.ids]).toEqual([]);
    expect([...tree.labels]).toEqual([]);
  });

  it("holds a modal view's own and none of its siblings'", () => {
    expect(
      names(
        '<div><div dir="auto">Under</div><div data-ios-modal="true"><div dir="auto">Over</div></div></div>',
      ),
    ).toEqual(['Over']);
  });
});

describe('the props iOS reads, written into the document', () => {
  it('marks accessible, modal and hidden views', () => {
    expect(iosProps({ accessible: true })).toMatchObject({ dataSet: { ios: 'element' } });
    expect(iosProps({ accessible: false })).toMatchObject({ dataSet: { ios: 'none' } });
    expect(iosProps({ accessibilityViewIsModal: true })).toMatchObject({
      dataSet: { iosModal: 'true' },
    });
    expect(iosProps({ accessibilityElementsHidden: true })).toMatchObject({ 'aria-hidden': true });
  });

  it('hands other props over as they are', () => {
    const props = { dataSet: { x: '1' } };
    expect(iosProps(props)).toBe(props);
  });
});
