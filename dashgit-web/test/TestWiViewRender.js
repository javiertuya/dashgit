import assert from 'assert';
import { wiRender } from '../app/WiViewRender.js'

describe('TestWiViewRender - Label rendering', function () {
  it('renders issue type labels with named colors without invalid # prefix', function () {
    const html = wiRender.gitlabel2html('giis-uniovi/test-update', 'Bug', 'red', true);
    assert.ok(html.includes('background-color:#ffffff;'));
    assert.ok(html.includes('color:red;'));
    assert.ok(html.includes('border:1px solid red;'));
  });

  it('renders issue type labels with hex colors correctly with # prefix', function () {
    const html = wiRender.gitlabel2html('giis-uniovi/test-update', 'Bug', '#ff0000', true);
    assert.ok(html.includes('background-color:#ffffff;'));
    assert.ok(html.includes('color:#ff0000;'));
    assert.ok(html.includes('border:1px solid #ff0000;'));
  });

  it('renders priority labels with white background, colored border and known icon', function () {
    const html = wiRender.gitlabel2html('giis-uniovi/test-update', 'High', 'd93f0b', false, true);
    assert.ok(html.includes('background-color:#ffffff;'));
    assert.ok(html.includes('color:#d93f0b;'));
    assert.ok(html.includes('border:1px solid #d93f0b;'));
    assert.ok(html.includes('fa-arrow-up'));
    assert.ok(html.includes('High'));
  });

  it('uses white text on dark label backgrounds based on luma', function () {
    const style = wiRender.getLabelStyle('Bug', '#000000');
    assert.strictEqual(style, 'background-color:#000000; color:#ffffff;');
  });

  it('uses black text on light label backgrounds based on luma', function () {
    const style = wiRender.getLabelStyle('Bug', '#ffffff');
    assert.strictEqual(style, 'background-color:#ffffff; color:#000000;');
  });

  it('computes luma values for hex colors correctly', function () {
    assert.strictEqual(Math.round(wiRender.getColorLuma('#000000')), 0);
    assert.strictEqual(Math.round(wiRender.getColorLuma('#ffffff')), 255);
    assert.ok(wiRender.getColorLuma('#888888') < 140);
    assert.ok(wiRender.getColorLuma('#eeeeee') > 140);
  });

  it('renders the pending merge badge for approved PRs awaiting merge', function () {
    const html = wiRender.actions2html({ pending_merge: true });
    assert.ok(html.includes('pending merge'));
    assert.ok(html.includes('bg-success'));
    assert.ok(html.includes('fa-code-merge'));
  });
});
