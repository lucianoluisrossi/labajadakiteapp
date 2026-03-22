// shop.js — KiteLook Store

const KITELOOK_PRODUCTS = [
    {
        id: 1,
        name: "Remera KiteLook Classic",
        category: "remeras",
        price: 15000,
        currency: "ARS",
        sizes: ["S", "M", "L", "XL"],
        description: "100% algodón. Diseño de barrilete bordado al pecho.",
        badge: null
    },
    {
        id: 2,
        name: "Remera Wind Rider",
        category: "remeras",
        price: 16500,
        currency: "ARS",
        sizes: ["S", "M", "L", "XL", "XXL"],
        description: "Dry-fit. Estampado exclusivo kitesurf.",
        badge: "NUEVO"
    },
    {
        id: 3,
        name: "Remera Offshore Tee",
        category: "remeras",
        price: 14000,
        currency: "ARS",
        sizes: ["M", "L", "XL"],
        description: "Corte oversize. Serigrafía de cometa y olas.",
        badge: null
    },
    {
        id: 4,
        name: "Buzo KiteLook Offshore",
        category: "buzos",
        price: 32000,
        currency: "ARS",
        sizes: ["S", "M", "L", "XL"],
        description: "Con capucha. Bordado KiteLook en pecho.",
        badge: null
    },
    {
        id: 5,
        name: "Buzo Zip Kitesurf",
        category: "buzos",
        price: 36000,
        currency: "ARS",
        sizes: ["M", "L", "XL"],
        description: "Cierre completo. Logo en espalda full size.",
        badge: "ÚLTIMOS"
    },
];

// Gradientes por categoría (placeholder de imagen)
const CAT_GRADIENT = {
    remeras:    [['#0f172a', '#1e40af'], ['#1e3a5f', '#0e7490'], ['#0c1a3b', '#1d4ed8']],
    buzos:      [['#111827', '#374151'], ['#1f2937', '#0f172a']],
    gorras:     [['#064e3b', '#065f46'], ['#134e4a', '#0f766e']],
    accesorios: [['#1e1b4b', '#4338ca'], ['#1a1a2e', '#7c3aed']]
};

const CAT_ICON = {
    remeras: '👕',
    buzos: '🧥',
    gorras: '🧢',
    accesorios: '🏄'
};

const WHATSAPP_NUMBER = '5492983500324';

let currentFilter = 'all';

function formatPrice(price, currency) {
    if (currency === 'ARS') return `$${price.toLocaleString('es-AR')}`;
    return `USD ${price}`;
}

function getGradient(category, index) {
    const list = CAT_GRADIENT[category] || [['#1e293b', '#334155']];
    const pair = list[index % list.length];
    return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

function buildProductCard(product, index) {
    const icon = CAT_ICON[product.category] || '🪁';
    const bg = getGradient(product.category, index);
    const waMsg = encodeURIComponent(
        `Hola! Me interesa *${product.name}* — ${formatPrice(product.price, product.currency)}. ¿Tenés disponible?`
    );
    const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`;
    const badgeHtml = product.badge
        ? `<span class="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider">${product.badge}</span>`
        : '';
    const sizesHtml = product.sizes
        .map(s => `<span class="text-[9px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">${s}</span>`)
        .join('');

    return `
    <div class="shop-product-card bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 flex flex-col">
        <div class="relative h-32 flex items-center justify-center flex-shrink-0" style="background:${bg};">
            <span class="text-5xl">${icon}</span>
            ${badgeHtml}
        </div>
        <div class="p-3 flex flex-col flex-1">
            <p class="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-0.5">${product.category}</p>
            <h3 class="text-sm font-black text-gray-900 leading-tight mb-1">${product.name}</h3>
            <p class="text-[11px] text-gray-500 leading-relaxed flex-1 mb-2">${product.description}</p>
            <div class="flex flex-wrap gap-1 mb-3">${sizesHtml}</div>
            <div class="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                <span class="text-base font-black text-gray-900">${formatPrice(product.price, product.currency)}</span>
                <a href="${waLink}" target="_blank" rel="noopener"
                   class="inline-flex items-center gap-1 bg-green-500 hover:bg-green-600 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm">
                    <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.096.543 4.07 1.497 5.786L0 24l6.387-1.47A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
                    </svg>
                    Consultar
                </a>
            </div>
        </div>
    </div>`;
}

function renderProducts(filter) {
    const grid = document.getElementById('shop-products-grid');
    const counter = document.getElementById('shop-results-count');
    if (!grid) return;

    const list = filter === 'all'
        ? KITELOOK_PRODUCTS
        : KITELOOK_PRODUCTS.filter(p => p.category === filter);

    if (counter) {
        const cat = filter === 'all' ? 'productos' : filter;
        counter.textContent = `${list.length} ${cat}`;
    }

    if (list.length === 0) {
        grid.innerHTML = `<p class="col-span-2 text-center text-gray-400 text-sm py-12">Sin productos en esta categoría</p>`;
        return;
    }

    grid.innerHTML = list.map((p, i) => buildProductCard(p, i)).join('');
}

function initShop() {
    renderProducts('all');

    const filterBtns = document.querySelectorAll('.shop-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.category;

            filterBtns.forEach(b => {
                b.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
                b.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
            });
            btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200');
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');

            renderProducts(currentFilter);
        });
    });
}

document.addEventListener('DOMContentLoaded', initShop);
