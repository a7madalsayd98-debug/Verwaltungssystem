// أدوات مشتركة لكل الصفحات: تشفير حقيقي (AES-GCM + PBKDF2)، حفظ موحد، وحماية من XSS

const PBKDF2_ITERATIONS = 210000;

function b64encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function b64decode(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// تشفير قاعدة البيانات كاملة؛ الناتج هو الكائن الذي يُكتب في ملف الفلاشة
async function encryptDb(password, dbObject) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(dbObject));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plaintext);
    return {
        format: "aes-gcm-v1",
        salt: b64encode(salt),
        iv: b64encode(iv),
        data: b64encode(ciphertext)
    };
}

// فك التشفير؛ يرمي استثناءً تلقائياً إذا كانت كلمة المرور خاطئة
async function decryptDb(password, fileObject) {
    const key = await deriveKey(password, b64decode(fileObject.salt));
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64decode(fileObject.iv) }, key, b64decode(fileObject.data)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
}

// تجميع كل بيانات الجلسة (موظفين + عملاء + منتجات + عمليات) في كائن واحد
function collectSessionDb() {
    return {
        data: JSON.parse(sessionStorage.getItem('employees')) || [],
        customers: JSON.parse(sessionStorage.getItem('customers')) || [],
        products: JSON.parse(sessionStorage.getItem('products')) || [],
        transactions: JSON.parse(sessionStorage.getItem('transactions')) || []
    };
}

// استرجاع مقبض الملف المخزن من صفحة الدخول للكتابة المباشرة عليه
function getStoredFileHandle() {
    return new Promise(resolve => {
        const request = indexedDB.open("SystemDB", 1);
        request.onupgradeneeded = e => e.target.result.createObjectStore("handles");
        request.onsuccess = e => {
            const db = e.target.result;
            const get = db.transaction("handles", "readonly").objectStore("handles").get("currentFile");
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

// الحفظ الموحد: يكتب مباشرة في الملف الأصلي إن أمكن، وإلا يحمّل نسخة محدثة
async function saveDbAndExit(successMessage) {
    const password = sessionStorage.getItem('current_db_pass');
    if (!password) {
        window.location.href = "index.html";
        return;
    }

    const fileObject = await encryptDb(password, collectSessionDb());
    const json = JSON.stringify(fileObject, null, 2);

    let savedDirectly = false;
    const handle = await getStoredFileHandle();
    if (handle) {
        try {
            const permission = await handle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                savedDirectly = true;
            }
        } catch (err) {
            // الكتابة المباشرة فشلت؛ سيتم التحويل إلى التحميل العادي
        }
    }

    if (!savedDirectly) {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sessionStorage.getItem('current_db_name') || "updated_database.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    sessionStorage.clear();
    if (successMessage) {
        alert(savedDirectly
            ? successMessage + "\n(تم الحفظ مباشرة في الملف الأصلي)"
            : successMessage + "\n(تم تحميل نسخة محدثة من الملف)");
    }
    window.location.href = "index.html";
}

// حماية من XSS: تحويل أي مدخلات مستخدم قبل عرضها داخل HTML
function esc(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
