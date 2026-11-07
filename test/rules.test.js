import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck, deal, leadCard, passOffset, passLabel, legalPlays, trickWinner, scoreHand,
  aiPass, aiPlay, trickPoints, winners, gameOver, moonOutcomes, aiMoonChoice,
} from '../rules.js';

test('deck sizes deal evenly for 3, 4 and 5 players', () => {
  assert.equal(buildDeck(3).length, 51);
  assert.ok(!buildDeck(3).includes('2C') && buildDeck(3).includes('2D'));
  assert.equal(buildDeck(4).length, 52);
  assert.equal(buildDeck(5).length, 50);
  assert.ok(!buildDeck(5).includes('2C') && !buildDeck(5).includes('2D') && buildDeck(5).includes('2S'));
  assert.deepEqual([3, 4, 5].map(leadCard), ['3C', '2C', '3C']);
  for (const n of [3, 4, 5]) {
    const hands = deal(n);
    assert.equal(new Set(hands.map((h) => h.length)).size, 1);
    assert.ok(hands.flat().includes(leadCard(n)) && hands.flat().includes('QS'));
  }
});

test('passing cycles', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((h) => passLabel(4, passOffset(4, h))),
    ['Pass left', 'Pass right', 'Pass across', 'No pass', 'Pass left']);
  assert.deepEqual([1, 2, 3, 4].map((h) => passLabel(3, passOffset(3, h))),
    ['Pass left', 'Pass right', 'No pass', 'Pass left']);
  assert.equal(passOffset(5, 5), 0);
});

test('legal plays', () => {
  const t = (cs) => cs.map((c, p) => ({ p, c }));
  assert.deepEqual(legalPlays(['2C', '5H', 'QS'], { trick: [], firstTrick: true }), ['2C']);
  assert.deepEqual(legalPlays(['3C', '9C', '5H'], { trick: [], firstTrick: true, lead: '3C' }), ['3C']);
  // first trick, void in clubs: no hearts or Q♠
  assert.deepEqual(legalPlays(['5H', 'QS', '3D'], { trick: t(['2C']), firstTrick: true }), ['3D']);
  // ...unless that is all you have
  assert.deepEqual(legalPlays(['5H', 'QS'], { trick: t(['2C']), firstTrick: true }), ['5H', 'QS']);
  // can't lead hearts until broken
  assert.deepEqual(legalPlays(['5H', '3D'], { trick: [], heartsBroken: false }), ['3D']);
  assert.deepEqual(legalPlays(['5H', '3D'], { trick: [], heartsBroken: true }), ['5H', '3D']);
  assert.deepEqual(legalPlays(['5H', '6H'], { trick: [], heartsBroken: false }), ['5H', '6H']);
  // must follow suit
  assert.deepEqual(legalPlays(['5H', '3D', 'KD'], { trick: t(['4D']) }), ['3D', 'KD']);
});

test('trick winner is the highest card of the led suit', () => {
  assert.equal(trickWinner([{ p: 2, c: '4D' }, { p: 3, c: 'AS' }, { p: 0, c: 'KD' }, { p: 1, c: '9D' }]), 0);
});

test('scoring, moon, and jack of diamonds', () => {
  const H = (k) => 'AKQJT98765432'.slice(0, k).split('').map((r) => r + 'H');
  assert.deepEqual(scoreHand([[...H(5)], ['QS', ...H(13).slice(5)], [], []]).pts, [5, 21, 0, 0]);
  const moon = scoreHand([[...H(13), 'QS'], ['JD'], [], []], { jd: true });
  assert.deepEqual(moon.pts, [0, 16, 26, 26]);
  assert.equal(moon.moon, 0);
  assert.equal(moon.jdBy, 1);
  assert.deepEqual(scoreHand([[...H(13), 'QS', 'JD'], [], []], { jd: true }).pts, [-10, 26, 26]);
  // shooter can take 26 off their own score instead
  assert.deepEqual(scoreHand([[...H(13), 'QS'], ['JD'], [], []], { jd: true, moonChoice: 'sub' }).pts, [-26, -10, 0, 0]);
  assert.deepEqual(moonOutcomes([10, 20, 30], [[...H(13), 'QS'], [], []]), { add: [10, 46, 56], sub: [-16, 20, 30] });
  assert.deepEqual(scoreHand([['JD'], H(13), ['QS']], { jd: false }).pts, [0, 13, 13]);
});

test('computer moon choice', () => {
  // adding 26 would end the game with someone else winning: subtract instead
  assert.equal(aiMoonChoice({ add: [90, 110, 80], sub: [64, 84, 54] }, 0, 100), 'sub');
  // adding 26 ends the game and the shooter wins: add
  assert.equal(aiMoonChoice({ add: [40, 110, 105], sub: [14, 84, 79] }, 0, 100), 'add');
  // nobody near the end, shooter behind: subtract
  assert.equal(aiMoonChoice({ add: [60, 56, 46], sub: [34, 30, 20] }, 0, 100), 'sub');
});

test('winners and game over', () => {
  assert.deepEqual(winners([40, 101, 40, 77]), [0, 2]);
  assert.equal(gameOver([49, 12], 50), false);
  assert.equal(gameOver([50, 12], 50), true);
});

test('computer players only make legal moves, every hand scores correctly', () => {
  for (const n of [3, 4, 5]) {
    for (const jd of [false, true]) {
      for (let game = 0; game < 40; game++) {
        let hands = deal(n);
        // pass left
        const passes = hands.map((h) => aiPass(h, { jd }));
        passes.forEach((cs) => assert.equal(new Set(cs).size, 3));
        hands = hands.map((h, p) => [...h.filter((c) => !passes[p].includes(c)), ...passes[(p - 1 + n) % n]]);
        const taken = hands.map(() => []);
        let turn = hands.findIndex((h) => h.includes(leadCard(n)));
        let heartsBroken = false;
        for (let trickNo = 0; hands[0].length; trickNo++) {
          const trick = [];
          for (let k = 0; k < n; k++) {
            const p = (turn + k) % n;
            const ctx = { trick, firstTrick: trickNo === 0, heartsBroken, n, lead: leadCard(n) };
            const c = aiPlay(hands[p], ctx, { jd });
            assert.ok(legalPlays(hands[p], ctx).includes(c), `illegal ${c}`);
            hands[p] = hands[p].filter((x) => x !== c);
            trick.push({ p, c });
            if (c[1] === 'H') heartsBroken = true;
          }
          if (trickNo === 0) assert.equal(trick[0].c, leadCard(n));
          turn = trickWinner(trick);
          taken[turn].push(...trick.map((t) => t.c));
        }
        assert.equal(taken.flat().length, buildDeck(n).length);
        const { pts, moon, jdBy } = scoreHand(taken, { jd });
        const sum = pts.reduce((a, b) => a + b, 0) + (jdBy >= 0 ? 10 : 0);
        assert.equal(sum, moon >= 0 ? 26 * (n - 1) : 26);
        assert.equal(taken.map(trickPoints).reduce((a, b) => a + b, 0), 26);
      }
    }
  }
});
