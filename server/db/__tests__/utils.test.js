'use strict';

const { parseTags } = require('../utils');

describe('parseTags', () => {
  test('returns empty arrays when called with no argument', () => {
    expect(parseTags()).toEqual({
      auto_tags: [], mistake_tags: [], sizing_tags: [], coach_tags: [],
    });
  });

  test('buckets tags by tag_type', () => {
    const rows = [
      { tag: 'C_BET',      tag_type: 'auto'    },
      { tag: 'OPEN_LIMP',  tag_type: 'mistake' },
      { tag: 'HALF_POT',   tag_type: 'sizing'  },
      { tag: 'good_spot',  tag_type: 'coach'   },
    ];
    expect(parseTags(rows)).toEqual({
      auto_tags:    ['C_BET'],
      mistake_tags: ['OPEN_LIMP'],
      sizing_tags:  ['HALF_POT'],
      coach_tags:   ['good_spot'],
    });
  });

  test('sizing_tags is populated when sizing rows exist', () => {
    const rows = [
      { tag: 'POT_BET',  tag_type: 'sizing' },
      { tag: 'OVERBET',  tag_type: 'sizing' },
    ];
    const result = parseTags(rows);
    expect(result.sizing_tags).toEqual(['POT_BET', 'OVERBET']);
    expect(result.auto_tags).toEqual([]);
    expect(result.mistake_tags).toEqual([]);
  });
});
