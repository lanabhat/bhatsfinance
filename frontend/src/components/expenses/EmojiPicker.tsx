import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (emoji: string) => void
  onClose: () => void
}

const SECTIONS = [
  { label: 'Finance & Work', emojis: ['💰','💳','🏦','💵','💴','💶','📈','📉','🪙','💼','🧾','📊','🏧','💹','🤑','💸','🏷️','🧮','📋','📌'] },
  { label: 'Food & Dining',  emojis: ['🍽️','🍔','🍕','☕','🍜','🥗','🍱','🛒','🍳','🥤','🍣','🍷','🎂','🍰','🥐','🥙','🍛','🧃','🧆','🥩'] },
  { label: 'Transport',      emojis: ['🚗','✈️','🚌','🚆','⛽','🛵','🚕','🏍️','🚲','🚢','🚁','🛺','🚐','🏎️','🚑','🚓','⛵','🛳️','🚀','🛻'] },
  { label: 'Home & Bills',   emojis: ['🏠','💡','🔌','🌊','🔑','🛋️','🧹','📦','🏡','🔧','🛁','🚿','🪴','🛏️','🪟','🧺','🔒','📡','🌐','🏗️'] },
  { label: 'Health',         emojis: ['🏥','💊','🩺','🏋️','🧘','🦷','👶','🩹','💉','🧬','🫀','🩻','🧴','🌡️','🏃','🚴','🧪','🩼','👁️','🦺'] },
  { label: 'Shopping',       emojis: ['🛍️','👗','👟','💄','📱','💻','⌚','🎧','📷','🕶️','👜','🧥','👒','💍','🖥️','⌨️','🖱️','🎒','👔','🛒'] },
  { label: 'Entertainment',  emojis: ['🎬','🎮','🎵','🎭','🏖️','🎪','🎨','🎯','🎲','🎤','🎸','🎻','🏆','⚽','🏀','🎳','🎫','🎟️','🎡','🎢'] },
  { label: 'Education',      emojis: ['📚','🎓','✏️','📐','🔬','🖊️','📝','🏫','🧑‍💻','📖','🗺️','🔭','🧩','📓','📒','📕','🖋️','📏','🗂️','💡'] },
  { label: 'Family & People',emojis: ['👶','🧒','👦','👧','🧑','👩','👨','🧓','👴','👵','👨‍👩‍👦','👨‍👩‍👧','💑','👪','🐶','🐱','🌸','💝','🎀','🎁'] },
  { label: 'Other',          emojis: ['📌','⭐','❤️','🎁','🔔','📅','🗒️','♻️','🏷️','⚙️','🔍','🗑️','📂','🗳️','🔐','💬','📣','🌟','✅','❌'] },
]

// keyword map for search — emoji → space-separated keywords
const KEYWORDS: Record<string, string> = {
  '💰': 'money cash savings wallet', '💳': 'card credit debit payment',
  '🏦': 'bank savings account', '💵': 'dollar cash money',
  '📈': 'growth stocks profit invest', '📉': 'loss decline stocks',
  '🪙': 'coin currency', '💼': 'work office business job',
  '🧾': 'receipt bill invoice', '📊': 'chart analytics stats',
  '🏧': 'atm cash machine', '💹': 'forex currency exchange',
  '🤑': 'rich money cash', '💸': 'spend expenses outflow',
  '🏷️': 'tag label price', '🧮': 'calculator accounting',
  '🍽️': 'food dining restaurant eat', '🍔': 'burger fast food',
  '🍕': 'pizza food', '☕': 'coffee cafe drink',
  '🍜': 'noodles ramen food', '🥗': 'salad healthy food',
  '🍱': 'bento lunch food', '🛒': 'grocery shopping cart',
  '🍳': 'cooking breakfast food', '🥤': 'drink juice soda',
  '🍣': 'sushi food japanese', '🍷': 'wine drink alcohol',
  '🚗': 'car drive vehicle transport', '✈️': 'flight travel airplane',
  '🚌': 'bus public transport', '🚆': 'train rail commute',
  '⛽': 'fuel petrol gas station', '🛵': 'scooter bike ride',
  '🚕': 'taxi cab uber ola ride', '🚲': 'bicycle cycle',
  '🏠': 'home house rent', '💡': 'electricity utility bill light',
  '🔌': 'electricity power utility', '🌊': 'water utility bill',
  '🔑': 'key rent house home', '🧹': 'cleaning maintenance home',
  '📦': 'package delivery moving', '🔧': 'repair maintenance fix',
  '🏥': 'hospital health medical', '💊': 'medicine pharmacy drugs',
  '🩺': 'doctor medical checkup', '🏋️': 'gym fitness exercise',
  '🧘': 'yoga meditation wellness', '🦷': 'dentist teeth dental',
  '👶': 'baby child kids', '🩹': 'first aid bandage',
  '🛍️': 'shopping bags retail', '👗': 'clothes fashion dress',
  '👟': 'shoes footwear sport', '💄': 'makeup cosmetics beauty',
  '📱': 'phone mobile app', '💻': 'laptop computer work',
  '⌚': 'watch wearable gadget', '🎧': 'headphones audio music',
  '🎬': 'movie cinema entertainment', '🎮': 'gaming video games play',
  '🎵': 'music streaming audio', '🎭': 'theater arts culture',
  '🏖️': 'beach vacation holiday travel', '🎨': 'art hobby creative',
  '🎯': 'goal target achievement', '🎲': 'games fun hobby',
  '📚': 'books reading education', '🎓': 'graduation degree course',
  '✏️': 'pencil writing school', '🔬': 'science lab research',
  '📝': 'notes study writing', '🏫': 'school education college',
  '📌': 'other misc general', '⭐': 'star favourite special',
  '❤️': 'heart love gift', '🎁': 'gift present occasion',
  '🔔': 'alert notification reminder', '📅': 'calendar schedule date',
  '♻️': 'recycle environment green', '⚙️': 'settings system service',
}

export function EmojiPicker({ value, onChange, onClose }: Props) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const query = search.toLowerCase().trim()

  const filtered = query
    ? SECTIONS.flatMap(s => s.emojis).filter(e => {
        const kw = KEYWORDS[e] ?? ''
        return e.includes(query) || kw.includes(query)
      })
    : null

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface)] shadow-xl overflow-hidden">
          {/* header */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <span className="text-xl">{value || '📌'}</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search emoji…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]"
            />
            <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none">×</button>
          </div>

          {/* emoji grid */}
          <div className="overflow-y-auto" style={{ maxHeight: '340px' }}>
            {filtered ? (
              <div className="p-3">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-muted)]">No emoji found</p>
                ) : (
                  <div className="grid grid-cols-8 gap-1">
                    {filtered.map(e => (
                      <EmojiBtn key={e} emoji={e} selected={e === value} onSelect={() => { onChange(e); onClose() }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              SECTIONS.map(section => (
                <div key={section.label} className="px-3 pt-3 pb-1">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{section.label}</p>
                  <div className="grid grid-cols-8 gap-1">
                    {section.emojis.map(e => (
                      <EmojiBtn key={e} emoji={e} selected={e === value} onSelect={() => { onChange(e); onClose() }} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function EmojiBtn({ emoji, selected, onSelect }: { emoji: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={KEYWORDS[emoji] ?? emoji}
      className={`flex items-center justify-center rounded-lg p-1.5 text-xl transition-colors hover:bg-[var(--surface-2)] ${
        selected ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/30' : ''
      }`}
    >
      {emoji}
    </button>
  )
}
