// Range-aware labeling frontend
const appState = {
  items: [],
  currentPointer: 0,
  rangeStart: 0,
  rangeEnd: 0
}

const el = id => document.getElementById(id)

async function fetchProgress(){
  const start = parseInt(el('start_index').value || 0)
  const end = parseInt(el('end_index').value || 0)
  const r = await fetch(`/api/progress?start=${start}&end=${end}`)
  if(!r.ok) return
  const j = await r.json()
  el('progress').innerText = `Labeled ${j.labeled_in_range} / ${j.range_total} (range)`
}

function clearGroups(){ el('groups').innerHTML = '' }

// Render a group according to the required reusable renderer logic
function renderGroup(groupTitle, columns, rowData){
  const section = document.createElement('section')
  section.className = 'group'
  const h = document.createElement('h3')
  h.innerText = groupTitle
  section.appendChild(h)
  const ul = document.createElement('ul')

  columns.forEach(col => {
    // special-case: ensure is_expert is always visible (render even if missing)
    if(col === 'is_expert'){
      const li = document.createElement('li')
      const val = (rowData && (rowData[col] !== undefined && rowData[col] !== null && String(rowData[col]).trim() !== '')) ? rowData[col] : '(missing)'
      li.innerHTML = `<strong>${col}:</strong> ${val}`
      ul.appendChild(li)
      return
    }

    if(rowData && rowData[col] !== undefined && rowData[col] !== null){
      const li = document.createElement('li')
      li.innerHTML = `<strong>${col}:</strong> ${rowData[col]}`
      ul.appendChild(li)
    }
  })

  section.appendChild(ul)
  return section
}

function renderCurrent(){
  clearGroups()
  const items = appState.items
  let currentPointer = appState.currentPointer
  if(items.length===0){
    el('sample_index').innerText = '-'
    el('title').innerText = 'No items in range or all skipped'
    return
  }
  if(currentPointer<0) currentPointer = 0
  if(currentPointer>=items.length) currentPointer = items.length-1
  appState.currentPointer = currentPointer
  const item = items[currentPointer]
  el('sample_index').innerText = item.sample_index
  const row = item.row || {}
  el('title').innerText = row.title || row.Title || '(no title)'

  // Group definitions (must match specification exactly)
  const metadataKeys = ['title','author','year','publication_year','description','Genre']
  const criticalKeys = ['Author_Rating','total_weeks','best_rank','worst_rank','mean_rank','debut_rank']
  const popularKeys = ['average_rating','ratings_count']
  const reviewKeys = ['rating','review_text','n_votes','is_expert']
  const commercialKeys = ['Units_Sold','Gross_Sales','Publisher_Revenue','Sale_Price','Sales_Rank']

  // Render the five mandatory groups (always append the section; fields inside rendered only if present,
  // except 'is_expert' which is always shown per requirement)
  el('groups').appendChild(renderGroup('Metadata', metadataKeys, row))
  el('groups').appendChild(renderGroup('Critical Success Indicators', criticalKeys, row))
  el('groups').appendChild(renderGroup('Popular Success Indicators', popularKeys, row))
  el('groups').appendChild(renderGroup('Review & Expertise', reviewKeys, row))
  el('groups').appendChild(renderGroup('Commercial Success Indicators', commercialKeys, row))

  // Additionally render any remaining columns present in the row (to ensure we don't silently drop any column).
  // These will be grouped under 'Other Columns'. This ensures 100% of columns from the backend are visible.
  const grouped = new Set([...metadataKeys, ...criticalKeys, ...popularKeys, ...reviewKeys, ...commercialKeys])
  const otherKeys = Object.keys(row).filter(k => !grouped.has(k))
  if(otherKeys.length){
    const otherSection = document.createElement('section')
    otherSection.className = 'group'
    const h = document.createElement('h3')
    h.innerText = 'Other Columns'
    otherSection.appendChild(h)
    const ul = document.createElement('ul')
    otherKeys.sort().forEach(k => {
      if(row[k] !== undefined && row[k] !== null){
        const li = document.createElement('li')
        li.innerHTML = `<strong>${k}:</strong> ${row[k]}`
        ul.appendChild(li)
      }
    })
    otherSection.appendChild(ul)
    el('groups').appendChild(otherSection)
  }

  el('critical_success_label').value = ''
  el('popular_success_label').value = ''
  el('commercial_success_label').value = ''
}

async function loadRange(){
  appState.rangeStart = parseInt(el('start_index').value || 0)
  appState.rangeEnd = parseInt(el('end_index').value || 0)
  if(appState.rangeEnd < appState.rangeStart){ alert('End must be >= start'); return }
  const skip = el('skip_labeled').checked ? 'true' : 'false'
  const show = el('show_labeled').checked ? 'true' : 'false'
  const r = await fetch(`/api/items?start=${appState.rangeStart}&end=${appState.rangeEnd}&skip_labeled=${skip}&show_labeled=${show}`)
  if(!r.ok){ alert('Failed to load range'); return }
  const j = await r.json()
  appState.items = j.items || []
  appState.currentPointer = 0
  await fetchProgress()
  renderCurrent()
}

async function saveLabel(){
  const items = appState.items
  if(items.length===0) return
  const item = items[appState.currentPointer]
  const payload = {
    sample_index: item.sample_index,
    critical_success_label: el('critical_success_label').value,
    popular_success_label: el('popular_success_label').value,
    commercial_success_label: el('commercial_success_label').value,
    annotator: el('annotator').value || ''
  }
  if(!payload.critical_success_label && !payload.popular_success_label && !payload.commercial_success_label){
    if(!confirm('No labels selected. Save empty labels?')) return
  }
  const r = await fetch('/api/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  if(!r.ok){ const t = await r.text(); alert('Save failed: '+t); return }
  appState.items.splice(appState.currentPointer,1)
  if(appState.currentPointer >= appState.items.length) appState.currentPointer = appState.items.length-1
  await fetchProgress()
  renderCurrent()
}

document.addEventListener('DOMContentLoaded', ()=>{
  el('load_range').addEventListener('click', async ()=>{ el('load_range').disabled=true; await loadRange(); el('load_range').disabled=false })
  el('prev').addEventListener('click', ()=>{ appState.currentPointer = Math.max(0, appState.currentPointer-1); renderCurrent() })
  el('next').addEventListener('click', ()=>{ appState.currentPointer = Math.min(appState.items.length-1, appState.currentPointer+1); renderCurrent() })
  el('save').addEventListener('click', async ()=>{ el('save').disabled = true; await saveLabel(); el('save').disabled=false })
  (async ()=>{
    const r = await fetch('/api/progress')
    if(r.ok){
      const j = await r.json()
      const total = j.total_in_dataset || j.total || 0
      el('end_index').value = Math.max(0, total-1)
      el('start_index').value = 0
      el('progress').innerText = `Labeled 0 / ${total} (dataset)`
    }
  })()
})
