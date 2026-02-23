import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Calendar, DollarSign, Calculator, Info, Printer, FileSpreadsheet, Trash, Camera, Loader2 } from 'lucide-react';
import jalaali from 'jalaali-js';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import domtoimage from 'dom-to-image-more';
import { GoogleGenAI } from '@google/genai';

type Cheque = {
  id: string;
  amount: string;
  date: string;
};

// Helper to format numbers with commas
const formatNumber = (num: string | number) => {
  if (!num) return '';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Helper to parse comma-separated numbers
const parseNumber = (str: string) => {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
};

// Helper to validate Jalali date string (YYYY/MM/DD)
const isValidJalali = (dateStr: string) => {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return jalaali.isValidJalaaliDate(y, m, d);
};

// Helper to convert Jalali string to JS Date
const jalaliToDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('/').map(Number);
  const { gy, gm, gd } = jalaali.toGregorian(y, m, d);
  return new Date(gy, gm - 1, gd);
};

// Helper to convert JS Date to Jalali string
const dateToJalali = (date: Date) => {
  const { jy, jm, jd } = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return `${jy}/${jm.toString().padStart(2, '0')}/${jd.toString().padStart(2, '0')}`;
};

// Get today's Jalali date
const getTodayJalali = () => {
  return dateToJalali(new Date());
};

// Auto-format date input (YYYY/MM/DD)
const formatJalaliInput = (value: string) => {
  let val = value.replace(/\D/g, '');
  if (val.length > 4) {
    val = val.slice(0, 4) + '/' + val.slice(4);
  }
  if (val.length > 7) {
    val = val.slice(0, 7) + '/' + val.slice(7, 9);
  }
  return val;
};

export default function App() {
  const [baseDate, setBaseDate] = useState(getTodayJalali());
  const [cheques, setCheques] = useState<Cheque[]>([
    { id: '1', amount: '', date: '' }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingOCR, setIsLoadingOCR] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const downloadPDF = async () => {
    const element = document.getElementById('pdf-content');
    if (!element) return;
    
    setIsGeneratingPDF(true);
    
    setTimeout(async () => {
      try {
        const dataUrl = await domtoimage.toPng(element, { bgcolor: '#ffffff' });
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (img.height * pdfWidth) / img.width;
          
          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save('ras-giri.pdf');
          setIsGeneratingPDF(false);
        };
      } catch (err) {
        console.error(err);
        alert('خطا در تولید فایل PDF');
        setIsGeneratingPDF(false);
      }
    }, 100);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingOCR(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64Data = (ev.target?.result as string).split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type,
              }
            },
            {
              text: 'Extract the date and amount from this cheque image. Return ONLY a JSON object with `date` (format: YYYY/MM/DD in Jalali) and `amount` (number). If you cannot find them, return null for those fields. Do not include markdown formatting.'
            }
          ],
          config: {
            responseMimeType: 'application/json',
          }
        });

        const text = response.text || '{}';
        const data = JSON.parse(text);
        
        if (data.amount || data.date) {
          const newCheque = {
            id: Date.now().toString(),
            amount: data.amount ? data.amount.toString() : '',
            date: data.date || ''
          };
          
          if (cheques.length === 1 && !cheques[0].amount && !cheques[0].date) {
            setCheques([newCheque]);
          } else {
            setCheques([...cheques, newCheque]);
          }
          alert('اطلاعات چک با موفقیت استخراج شد');
        } else {
          alert('اطلاعاتی در تصویر یافت نشد');
        }
      } catch (err) {
        console.error(err);
        alert('خطا در پردازش تصویر');
      } finally {
        setIsLoadingOCR(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const addCheque = () => {
    setCheques([...cheques, { id: Date.now().toString(), amount: '', date: '' }]);
  };

  const removeCheque = (id: string) => {
    setCheques(cheques.filter(c => c.id !== id));
  };

  const updateCheque = (id: string, field: keyof Cheque, value: string) => {
    setCheques(cheques.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const clearAll = () => {
    if (window.confirm('آیا از پاک کردن همه چک‌ها اطمینان دارید؟')) {
      setCheques([{ id: Date.now().toString(), amount: '', date: '' }]);
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]] || {});

        const newCheques: Cheque[] = [];
        json.forEach((r) => {
          const amount = r.amount || r['مبلغ'] || r.mablagh || '';
          const date = r.date || r['تاریخ'] || r.tarikh || '';
          if (amount || date) {
            newCheques.push({
              id: Date.now().toString() + Math.random().toString(36).substring(7),
              amount: amount.toString(),
              date: date.toString()
            });
          }
        });

        if (newCheques.length > 0) {
          if (cheques.length === 1 && !cheques[0].amount && !cheques[0].date) {
            setCheques(newCheques);
          } else {
            setCheques([...cheques, ...newCheques]);
          }
          alert(`بارگذاری موفق: ${newCheques.length} چک اضافه شد`);
        } else {
          alert('هیچ چک معتبری در فایل پیدا نشد');
        }
      } catch (err) {
        console.error(err);
        alert('خطا در خواندن فایل');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // Optimized Calculation Logic: Compute everything in one pass
  const { processedCheques, results, isBaseValid } = useMemo(() => {
    const baseValid = isValidJalali(baseDate);
    const baseD = baseValid ? jalaliToDate(baseDate) : null;

    let totalAmount = 0;
    let totalValueDays = 0;
    let validChequesCount = 0;

    const processed = cheques.map(cheque => {
      const amt = parseNumber(cheque.amount);
      const isDateValid = isValidJalali(cheque.date);
      let days = '-';

      if (baseD && isDateValid) {
        const chqD = jalaliToDate(cheque.date);
        const diffTime = chqD.getTime() - baseD.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        days = diffDays.toString();

        if (amt > 0) {
          totalAmount += amt;
          totalValueDays += (amt * diffDays);
          validChequesCount++;
        }
      }

      return {
        ...cheque,
        parsedAmount: amt,
        isDateValid,
        isInvalid: cheque.date.length >= 8 && !isDateValid,
        days
      };
    });

    let res = null;
    if (totalAmount > 0 && validChequesCount > 0 && baseD) {
      const averageDays = Math.round(totalValueDays / totalAmount);
      const rasDateObj = new Date(baseD.getTime() + averageDays * 24 * 60 * 60 * 1000);
      res = {
        totalAmount,
        averageDays,
        rasDate: dateToJalali(rasDateObj),
        validChequesCount
      };
    }

    return { processedCheques: processed, results: res, isBaseValid: baseValid };
  }, [baseDate, cheques]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-slate-100 to-slate-200 py-8 px-4 sm:px-6 lg:px-8 print:bg-white print:py-4">
      <div id="pdf-content" className="max-w-4xl mx-auto space-y-8 p-4 bg-transparent">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3 mb-10 print:mb-6"
        >
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600/10 rounded-2xl mb-2 print:hidden">
            <Calculator className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">محاسبه راس چک</h1>
          <p className="text-slate-500 text-lg print:text-slate-600">ابزار هوشمند محاسبه میانگین زمانی و راس چک‌های دریافتی و پرداختی</p>
        </motion.div>

        {/* Top Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Base Date Card */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 print:shadow-none print:border-slate-200 print:p-4"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 print:hidden">
                <Calendar className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">تاریخ مبدا</h2>
            </div>
            <div>
              {isGeneratingPDF ? (
                <div className="w-full px-5 py-3 text-left dir-ltr text-lg font-medium text-slate-800" dir="ltr">{baseDate}</div>
              ) : (
                <input
                  type="text"
                  value={baseDate}
                  onChange={(e) => setBaseDate(formatJalaliInput(e.target.value))}
                  placeholder="1403/01/01"
                  className={`w-full px-5 py-3 bg-slate-50/50 border rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-left dir-ltr text-lg print:border-none print:p-0 print:text-right print:font-medium print:bg-transparent ${!isBaseValid && baseDate.length >= 8 ? 'border-red-300 bg-red-50/50 text-red-900' : 'border-slate-200/60'}`}
                  dir="ltr"
                />
              )}
              {!isBaseValid && baseDate.length >= 8 && !isGeneratingPDF && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-sm mt-2 font-medium print:hidden">تاریخ وارد شده نامعتبر است</motion.p>
              )}
            </div>
          </motion.div>

          {/* Actions Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 flex flex-wrap gap-3 items-center justify-center print:hidden ${isGeneratingPDF ? 'hidden' : ''}`}
          >
            <button onClick={addCheque} className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all text-sm font-semibold w-[150px] justify-center shadow-sm shadow-indigo-200">
              <Plus className="w-4 h-4" /> افزودن چک
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all text-sm font-semibold w-[150px] justify-center shadow-sm shadow-emerald-200">
              <FileSpreadsheet className="w-4 h-4" /> بارگذاری اکسل
            </button>
            <input type="file" ref={fileInputRef} onChange={handleExcelUpload} accept=".xlsx,.xls" className="hidden" />
            
            <button onClick={() => imageInputRef.current?.click()} disabled={isLoadingOCR} className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 active:scale-95 transition-all text-sm font-semibold w-[150px] justify-center shadow-sm shadow-amber-200 disabled:opacity-70">
              {isLoadingOCR ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} خواندن از عکس
            </button>
            <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

            <button onClick={clearAll} className="flex items-center gap-2 px-4 py-3 bg-rose-500 text-white rounded-2xl hover:bg-rose-600 active:scale-95 transition-all text-sm font-semibold w-[150px] justify-center shadow-sm shadow-rose-200">
              <Trash className="w-4 h-4" /> پاک کردن همه
            </button>
            {results && (
              <button onClick={downloadPDF} className="flex items-center gap-2 px-4 py-3 bg-slate-800 text-white rounded-2xl hover:bg-slate-900 active:scale-95 transition-all text-sm font-semibold w-[150px] justify-center shadow-sm shadow-slate-300">
                <Printer className="w-4 h-4" /> خروجی PDF
              </button>
            )}
          </motion.div>
        </div>

        {/* Cheques Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden print:shadow-none print:border-slate-200"
        >
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 print:hidden">
                <DollarSign className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">لیست چک‌ها <span className="text-sm font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full mr-2">({cheques.length})</span></h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-sm">
                  <th className="p-4 font-semibold w-16 text-center">ردیف</th>
                  <th className="p-4 font-semibold">مبلغ (ریال)</th>
                  <th className="p-4 font-semibold">تاریخ سررسید</th>
                  <th className="p-4 font-semibold text-center">روزها</th>
                  <th className={`p-4 font-semibold text-center print:hidden w-20 ${isGeneratingPDF ? 'hidden' : ''}`}>عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                <AnimatePresence mode="popLayout">
                  {processedCheques.map((cheque, index) => (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0, scale: 0.95, backgroundColor: '#f8fafc' }}
                      animate={{ opacity: 1, scale: 1, backgroundColor: cheque.isInvalid ? '#fef2f2' : '#ffffff' }}
                      exit={{ opacity: 0, scale: 0.95, backgroundColor: '#f8fafc' }}
                      transition={{ duration: 0.2 }}
                      key={cheque.id} 
                      className="group hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-4 text-center text-slate-400 font-medium">{index + 1}</td>
                      <td className="p-4">
                        {isGeneratingPDF ? (
                          <div className="w-full px-4 py-2.5 text-left font-medium text-slate-700" dir="ltr">{formatNumber(cheque.amount)}</div>
                        ) : (
                          <input
                            type="text"
                            value={formatNumber(cheque.amount)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              updateCheque(cheque.id, 'amount', val);
                            }}
                            placeholder="مثلا 10,000,000"
                            className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200/60 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-left print:border-none print:p-0 print:text-right print:bg-transparent font-medium text-slate-700"
                            dir="ltr"
                          />
                        )}
                      </td>
                      <td className="p-4">
                        {isGeneratingPDF ? (
                          <div className="w-full px-4 py-2.5 text-left font-medium text-slate-700" dir="ltr">{cheque.date}</div>
                        ) : (
                          <input
                            type="text"
                            value={cheque.date}
                            onChange={(e) => updateCheque(cheque.id, 'date', formatJalaliInput(e.target.value))}
                            placeholder="1403/05/12"
                            className={`w-full px-4 py-2.5 bg-slate-50/50 border rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-left print:border-none print:p-0 print:text-right print:bg-transparent font-medium text-slate-700 ${cheque.isInvalid ? 'border-red-300 bg-red-50/50 text-red-900 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200/60'}`}
                            dir="ltr"
                          />
                        )}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-600" dir="ltr">
                        {cheque.days}
                      </td>
                      <td className={`p-4 text-center print:hidden ${isGeneratingPDF ? 'hidden' : ''}`}>
                        <button
                          onClick={() => removeCheque(cheque.id)}
                          className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer active:scale-90"
                        >
                          <Trash2 className="w-5 h-5 mx-auto" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Results Card */}
        <AnimatePresence>
          {results && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl shadow-xl shadow-indigo-500/20 p-8 text-white print:bg-white print:text-slate-900 print:shadow-none print:border print:border-slate-200 print:p-6 relative overflow-hidden"
            >
              {/* Decorative background circles */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl print:hidden"></div>
              <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-black opacity-10 rounded-full blur-2xl print:hidden"></div>

              <div className="flex items-center justify-between mb-8 opacity-95 print:opacity-100 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl print:hidden">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold print:text-slate-800">نتیجه نهایی راس‌گیری</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 relative z-10">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 print:bg-slate-50 print:border-slate-200">
                  <p className="text-indigo-100 text-sm mb-2 font-medium print:text-slate-500">جمع کل مبالغ</p>
                  <p className="text-2xl sm:text-3xl font-extrabold print:text-slate-900 tracking-tight">{formatNumber(results.totalAmount)} <span className="text-sm font-normal opacity-70">ریال</span></p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 print:bg-slate-50 print:border-slate-200">
                  <p className="text-indigo-100 text-sm mb-2 font-medium print:text-slate-500">میانگین وزنی روزها</p>
                  <p className="text-2xl sm:text-3xl font-extrabold print:text-slate-900 tracking-tight" dir="rtl">{results.averageDays} <span className="text-sm font-normal opacity-70">روز</span></p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 print:bg-slate-50 print:border-slate-200">
                  <p className="text-indigo-100 text-sm mb-2 font-medium print:text-slate-500">تاریخ دقیق راس</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-emerald-300 print:text-emerald-600 tracking-tight">{results.rasDate}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {!results && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 print:hidden border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50"
          >
            <Info className="w-8 h-8 text-slate-300" />
            <p className="text-sm sm:text-base text-center font-medium">برای مشاهده نتیجه، اطلاعات حداقل یک چک را به درستی وارد کنید.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
