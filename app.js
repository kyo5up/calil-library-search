const APPKEY = 'f6df226dcd24080cbc65d6f3afc76850';
const LIBRARY_API = 'https://api.calil.jp/library';
const CHECK_API = 'https://api.calil.jp/check';

let selectedLibraries = [];

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('btn-gps').addEventListener('click', () => {
  const status = document.getElementById('library-status');
  status.className = 'status loading';
  status.textContent = '位置情報を取得中...';
  document.getElementById('library-results').innerHTML = '';

  if (!navigator.geolocation) {
    setError(status, 'このブラウザは位置情報に対応していません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const geocode = `${pos.coords.longitude},${pos.coords.latitude}`;
      status.textContent = `位置情報取得完了 (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}) — 図書館を検索中...`;
      searchLibraries({ geocode });
    },
    err => {
      setError(status, `位置情報の取得に失敗しました: ${err.message}`);
    }
  );
});

document.getElementById('btn-address').addEventListener('click', () => {
  const address = document.getElementById('input-address').value.trim();
  if (!address) return;

  const status = document.getElementById('library-status');
  status.className = 'status loading';
  status.textContent = `「${address}」で図書館を検索中...`;
  document.getElementById('library-results').innerHTML = '';

  const prefMap = buildPrefMap();
  let params = {};
  let matched = false;

  for (const [pref, key] of Object.entries(prefMap)) {
    if (address.startsWith(pref)) {
      params.pref = key;
      const rest = address.slice(pref.length).trim();
      if (rest) params.city = rest;
      matched = true;
      break;
    }
  }

  if (!matched) {
    params.city = address;
  }

  searchLibraries(params);
});

document.getElementById('input-address').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-address').click();
});

function searchLibraries(params) {
  const status = document.getElementById('library-status');
  const url = buildUrl(LIBRARY_API, {
    appkey: APPKEY,
    format: 'json',
    callback: 'PLACEHOLDER',
    limit: 20,
    ...params
  });

  jsonp(url, 'PLACEHOLDER', data => {
    if (!data || data.length === 0) {
      status.className = 'status';
      status.textContent = '図書館が見つかりませんでした。都道府県名から始めて試してみてください（例: 東京都渋谷区）';
      return;
    }
    status.className = 'status';
    status.textContent = `${data.length} 件の図書館が見つかりました`;
    renderLibraries(data);
  }, err => {
    setError(status, '図書館の検索に失敗しました');
  });
}

function renderLibraries(libraries) {
  const container = document.getElementById('library-results');
  selectedLibraries = [];

  const listDiv = document.createElement('div');
  listDiv.className = 'library-list';

  libraries.forEach(lib => {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.dataset.systemid = lib.systemid;
    item.dataset.name = lib.formal;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `lib-${lib.systemid}`;

    const info = document.createElement('div');
    info.className = 'library-info';
    info.innerHTML = `
      <div class="library-name">${escHtml(lib.formal)}</div>
      <div class="library-address">${escHtml(lib.address || '')}</div>
      <div class="library-system">SystemID: ${escHtml(lib.systemid)}</div>
    `;

    item.appendChild(cb);
    item.appendChild(info);
    listDiv.appendChild(item);

    item.addEventListener('click', e => {
      if (e.target !== cb) cb.checked = !cb.checked;
      item.classList.toggle('selected', cb.checked);
      updateSelectedLibraries();
    });
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'select-btn-row';
  const btnAll = document.createElement('button');
  btnAll.className = 'btn btn-primary';
  btnAll.textContent = '全て選択';
  const btnNone = document.createElement('button');
  btnNone.className = 'btn';
  btnNone.style.background = '#e2e8f0';
  btnNone.textContent = '全て解除';

  btnAll.addEventListener('click', () => {
    listDiv.querySelectorAll('.library-item').forEach(item => {
      item.querySelector('input[type="checkbox"]').checked = true;
      item.classList.add('selected');
    });
    updateSelectedLibraries();
  });

  btnNone.addEventListener('click', () => {
    listDiv.querySelectorAll('.library-item').forEach(item => {
      item.querySelector('input[type="checkbox"]').checked = false;
      item.classList.remove('selected');
    });
    updateSelectedLibraries();
  });

  btnRow.appendChild(btnAll);
  btnRow.appendChild(btnNone);

  container.innerHTML = '';
  container.appendChild(listDiv);
  container.appendChild(btnRow);
}

function updateSelectedLibraries() {
  selectedLibraries = [];
  document.querySelectorAll('.library-item').forEach(item => {
    if (item.querySelector('input[type="checkbox"]').checked) {
      selectedLibraries.push({
        systemid: item.dataset.systemid,
        name: item.dataset.name
      });
    }
  });

  const section = document.getElementById('section-book');
  const label = document.getElementById('selected-libraries-label');

  if (selectedLibraries.length > 0) {
    section.style.display = 'block';
    label.textContent = selectedLibraries.map(l => l.name).join('、');
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    label.textContent = '（未選択）';
  }
}

document.getElementById('btn-book-search').addEventListener('click', () => {
  const rawIsbn = document.getElementById('input-isbn').value.trim().replace(/-/g, '');
  if (!rawIsbn) return;
  if (selectedLibraries.length === 0) {
    alert('図書館を1つ以上選択してください');
    return;
  }

  const status = document.getElementById('book-status');
  const results = document.getElementById('book-results');
  status.className = 'status loading';
  status.textContent = '蔵書を検索中...';
  results.innerHTML = '';

  const systemids = [...new Set(selectedLibraries.map(l => l.systemid))].join(',');

  const url = buildUrl(CHECK_API, {
    appkey: APPKEY,
    isbn: rawIsbn,
    systemid: systemids,
    format: 'json',
    callback: 'PLACEHOLDER'
  });

  startCheckPolling(url, rawIsbn, status, results);
});

document.getElementById('input-isbn').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-book-search').click();
});

function startCheckPolling(url, isbn, status, resultsDiv) {
  let session = null;
  let attempts = 0;
  const maxAttempts = 15;

  function poll(pollUrl) {
    attempts++;
    if (attempts > maxAttempts) {
      setError(status, 'タイムアウトしました。再度お試しください。');
      return;
    }

    jsonp(pollUrl, 'PLACEHOLDER', data => {
      if (!data) {
        setError(status, 'レスポンスの取得に失敗しました');
        return;
      }

      session = data.session;
      const isRunning = data.continue === 1;

      renderBookResults(data.books, isbn, resultsDiv);

      if (isRunning) {
        status.className = 'status loading';
        status.textContent = `検索中... (${attempts}/${maxAttempts})`;
        setTimeout(() => {
          const nextUrl = buildUrl(CHECK_API, {
            appkey: APPKEY,
            session: session,
            format: 'json',
            callback: 'PLACEHOLDER'
          });
          poll(nextUrl);
        }, 2000);
      } else {
        status.className = 'status';
        status.textContent = '検索完了';
      }
    }, () => {
      setError(status, '蔵書検索に失敗しました');
    });
  }

  poll(url);
}

function renderBookResults(books, isbn, container) {
  if (!books || !books[isbn]) {
    container.innerHTML = '<p style="color:#718096;margin-top:12px;">該当する蔵書データがありません</p>';
    return;
  }

  const bookData = books[isbn];
  const rows = [];

  selectedLibraries.forEach(lib => {
    const sysData = bookData[lib.systemid];
    if (!sysData) return;

    const libkey = Object.keys(sysData)[0];
    if (!libkey) return;
    const info = sysData[libkey];

    rows.push({
      name: lib.name,
      status: info.status,
      reserveUrl: info.reserveurl
    });
  });

  if (rows.length === 0) {
    container.innerHTML = '<p style="color:#718096;margin-top:12px;">選択した図書館にデータがありません</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'book-results-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>図書館</th>
        <th>貸出状況</th>
        <th>予約</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(row.name)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.reserveUrl ? `<a class="reserve-link" href="${escHtml(row.reserveUrl)}" target="_blank" rel="noopener">予約ページへ →</a>` : '—'}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

function statusBadge(status) {
  const map = {
    'OK': ['badge-ok', '貸出可'],
    'Running': ['badge-running', '確認中'],
    'Error': ['badge-error', 'エラー'],
    'No': ['badge-unknown', '蔵書なし'],
    'prepare': ['badge-running', '準備中'],
    'unknown': ['badge-unknown', '不明'],
  };
  const [cls, label] = map[status] || ['badge-unknown', status || '不明'];
  return `<span class="badge ${cls}">${label}</span>`;
}

let jsonpCounter = 0;

function jsonp(url, _callbackNameIgnored, onSuccess, onError) {
  const cbName = `_calilCb${++jsonpCounter}`;

  document.querySelectorAll('script[data-jsonp]').forEach(s => s.remove());

  window[cbName] = data => {
    delete window[cbName];
    onSuccess(data);
  };

  const finalUrl = url.replace(/callback=[^&]+/, `callback=${cbName}`);

  const script = document.createElement('script');
  script.dataset.jsonp = '1';
  script.src = finalUrl;
  script.onerror = () => {
    delete window[cbName];
    script.remove();
    if (onError) onError();
  };
  document.head.appendChild(script);
}

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${qs}`;
}

function setError(el, msg) {
  el.className = 'status error';
  el.textContent = msg;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrefMap() {
  return {
    '北海道': '北海道', '青森県': '青森県', '岩手県': '岩手県', '宮城県': '宮城県',
    '秋田県': '秋田県', '山形県': '山形県', '福島県': '福島県', '茨城県': '茨城県',
    '栃木県': '栃木県', '群馬県': '群馬県', '埼玉県': '埼玉県', '千葉県': '千葉県',
    '東京都': '東京都', '神奈川県': '神奈川県', '新潟県': '新潟県', '富山県': '富山県',
    '石川県': '石川県', '福井県': '福井県', '山梨県': '山梨県', '長野県': '長野県',
    '岐阜県': '岐阜県', '静岡県': '静岡県', '愛知県': '愛知県', '三重県': '三重県',
    '滋賀県': '滋賀県', '京都府': '京都府', '大阪府': '大阪府', '兵庫県': '兵庫県',
    '奈良県': '奈良県', '和歌山県': '和歌山県', '鳥取県': '鳥取県', '島根県': '島根県',
    '岡山県': '岡山県', '広島県': '広島県', '山口県': '山口県', '徳島県': '徳島県',
    '香川県': '香川県', '愛媛県': '愛媛県', '高知県': '高知県', '福岡県': '福岡県',
    '佐賀県': '佐賀県', '長崎県': '長崎県', '熊本県': '熊本県', '大分県': '大分県',
    '宮崎県': '宮崎県', '鹿児島県': '鹿児島県', '沖縄県': '沖縄県'
  };
}
