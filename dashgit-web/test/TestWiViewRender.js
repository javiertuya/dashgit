import assert from 'assert';
import { wiRender } from '../app/WiViewRender.js'
import { notifCache } from '../app/core/NotifCache.js'

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

  it('renders the review request badge with a locatable class for async muting', function () {
    const html = wiRender.actions2html({ review_request: true });
    assert.ok(html.includes('review request'));
    assert.ok(html.includes('wi-action-review-request'));
  });

  it('renders the muted in-review badge with a locatable class for async upgrading', function () {
    const html = wiRender.actions2html({ in_review: true });
    assert.ok(html.includes('in review'));
    assert.ok(html.includes('wi-action-in-review'));
    assert.ok(html.includes('opacity-50'));
  });

  it('pending merge takes precedence over review request and in review badges', function () {
    const html = wiRender.actions2html({ review_request: true, in_review: true, pending_merge: true });
    assert.ok(html.includes('pending merge'));
    assert.ok(!html.includes('review request'));
    assert.ok(!html.includes('in review'));
  });
});

describe('TestWiViewRender - Notification rendering', function () {
  const uid = 'giis-uniovi-test-update_issue_1';
  afterEach(function () {
    notifCache.reset();
  });
  function renderReason(reason) {
    notifCache.data['gh1'] = { [uid]: reason };
    return wiRender.notifications2html('gh1', uid);
  }

  it('renders the mention icon for each reason that mentions the user', function () {
    for (const reason of ['mention', 'team_mention', 'mentioned', 'directly_addressed']) {
      assert.ok(notifCache.isMention(reason), `${reason} must be a mention`);
      assert.ok(renderReason(reason).includes(wiRender.mentionIconClass), `${reason} must render the mention icon`);
    }
  });

  it('renders the bell icon for reasons that do not mention the user', function () {
    for (const reason of ['subscribed', 'assign', 'author', 'state_change']) {
      assert.ok(!notifCache.isMention(reason), `${reason} must not be a mention`);
      assert.ok(renderReason(reason).includes(wiRender.notificationIconClass), `${reason} must render the bell icon`);
    }
  });

  it('renders nothing when there is no notification for the work item', function () {
    notifCache.data['gh1'] = {};
    assert.strictEqual(wiRender.notifications2html('gh1', uid), '');
    notifCache.reset();
    assert.strictEqual(wiRender.notifications2html('gh1', uid), '');
  });
});
