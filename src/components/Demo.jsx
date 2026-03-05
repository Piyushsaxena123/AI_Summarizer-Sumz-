import React, { useState, useEffect } from "react";
import { copy, linkIcon, loader, tick } from "../assets";
import { useLazyGetSummaryQuery } from "../services/article";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const Demo = () => {
  const [article, setArticle] = useState({
    url: "",
    summary: "",
  });
  const [allArticles, setAllArticles] = useState([]);
  const [copied, setCopied] = useState("");
  const [copiedSummary, setCopiedSummary] = useState(false);

  const [summaryLength, setSummaryLength] = useState(3);
  const [language, setLanguage] = useState("en");
  
  const [viewMode, setViewMode] = useState("summary"); 
  const [mode, setMode] = useState("url"); 
  const [textInput, setTextInput] = useState("");
  const [isHFLoading, setIsHFLoading] = useState(false); 

  const [getSummary, { error, isFetching }] = useLazyGetSummaryQuery();

  useEffect(() => {
    const articlesFromLocalStorage = JSON.parse(localStorage.getItem("articles"));
    if (articlesFromLocalStorage) {
      setAllArticles(articlesFromLocalStorage);
    }
  }, []);

  const handleCopySummary = (summaryText) => {
    setCopiedSummary(true);
    navigator.clipboard.writeText(summaryText);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // --- MODE: PASTE TEXT (Hugging Face Fallback) ---
    if (mode === "text") {
      setIsHFLoading(true);

      const langNames = { 
        en: "English", 
        hi: "Hindi", 
        pa: "Punjabi", 
        gu: "Gujarati", 
        es: "Spanish" 
      };
      const selectedLang = langNames[language] || "English";

      try {
        // We use Llama-3.2 because it handles Translation + Summarization much better
        const response = await fetch(
          "https://router.huggingface.co/hf-inference/models/meta-llama/Llama-3.2-3B-Instruct",
          {
            headers: { 
              Authorization: `Bearer ${import.meta.env.VITE_HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({ 
              inputs: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>
              Summarize the following text in ${selectedLang} language. 
              The summary must be exactly ${summaryLength} sentences long.
              
              Text: ${textInput}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
              parameters: {
                max_new_tokens: 500,
                temperature: 0.7,
                return_full_text: false
              },
              options: { 
                wait_for_model: true, 
                use_cache: false 
              }
            }),
          }
        );

        const result = await response.json();

        if (result.error && result.estimated_time) {
          alert(`AI is waking up. Please try again in ${Math.round(result.estimated_time)} seconds.`);
          return;
        }

        const summaryContent = result[0]?.generated_text || result.generated_text;

        if (summaryContent) {
          const newArticle = { 
            url: "Manual Text Input",
            summary: summaryContent.trim(), 
            lang: language, 
            length: summaryLength 
          };
          
          const updatedAllArticles = [newArticle, ...allArticles].slice(0, 5);
          setArticle(newArticle);
          setAllArticles(updatedAllArticles);
          localStorage.setItem("articles", JSON.stringify(updatedAllArticles));
          setViewMode("summary");
        }
      } catch (err) {
        console.error("HF Error:", err);
      } finally {
        setIsHFLoading(false);
      }
      return; 
    }

    // --- MODE: URL LINK (Primary API) ---
    const existingArticle = allArticles.find(
      (item) => 
        item.url === article.url && 
        item.length === summaryLength && 
        item.lang === language
    );

    if (existingArticle) {
      setArticle(existingArticle);
      setViewMode("summary");
      return;
    }

    const { data } = await getSummary({ 
      articleUrl: article.url,
      length: Number(summaryLength),
      lang: language 
    });

    if (data?.summary) {
      const newArticle = { 
        ...article, 
        summary: data.summary, 
        lang: language, 
        length: summaryLength 
      };
      
      const updatedAllArticles = [newArticle, ...allArticles].slice(0, 5);
      setArticle(newArticle);
      setAllArticles(updatedAllArticles);
      localStorage.setItem("articles", JSON.stringify(updatedAllArticles));
      setViewMode("summary"); 
    }
  };

  const downloadPDF = async () => {
    const element = document.getElementById("summary_result"); 
    const canvas = await html2canvas(element, {
      scale: 2, 
      useCORS: true,  
      backgroundColor: "#ffffff" 
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    pdf.setFontSize(18);
    pdf.setTextColor(255, 119, 0);
    pdf.text("AI Article Summary", 15, 20);
    pdf.addImage(imgData, "PNG", 10, 30, pdfWidth - 20, 0);
    pdf.save("summary.pdf");
  };

  const handleCopy = (copyUrl) => {
    setCopied(copyUrl);
    navigator.clipboard.writeText(copyUrl);
    setTimeout(() => setCopied(false), 3000);
  };

  const clearHistory = () => {
    localStorage.removeItem("articles");
    setAllArticles([]);
  };

  return (
    <section className="mt-16 w-full max-w-xl">
      <div className="flex flex-col w-full gap-2">
        <div className="flex justify-center gap-4 mb-4">
          <button 
            onClick={() => setMode("url")}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${mode === 'url' ? 'bg-black text-white' : 'bg-white/50 text-gray-600'}`}
          >
            URL Link
          </button>
          <button 
            onClick={() => setMode("text")}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${mode === 'text' ? 'bg-black text-white' : 'bg-white/50 text-gray-600'}`}
          >
            Paste Text
          </button>
        </div>

        <form className="relative flex flex-col justify-center items-center gap-3" onSubmit={handleSubmit}>
          {mode === "url" ? (
            <div className="relative w-full">
              <img src={linkIcon} alt="link-icon" className="absolute left-0 my-2 ml-3 w-5" />
              <input
                type="url"
                placeholder="Paste the article link"
                value={article.url}
                onChange={(e) => setArticle({ ...article, url: e.target.value })}
                required
                className="url_input peer"
              />
              <button type="submit" className="submit_btn peer-focus:border-gray-700 peer-focus:text-gray-700">↵</button>
            </div>
          ) : (
            <div className="relative w-full">
              <textarea
                placeholder="Paste your article text here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                required
                className="block w-full p-4 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl focus:ring-orange-500 focus:border-orange-500 min-h-[150px] shadow-sm outline-none font-inter"
              />
              <button type="submit" className="mt-2 w-full py-2.5 bg-black text-white rounded-lg font-bold hover:opacity-80 transition-all shadow-md">
                Summarize Text ✨
              </button>
            </div>
          )}
        </form>

        <div className='flex flex-col md:flex-row gap-4 w-full my-5 p-5 rounded-xl bg-white/20 backdrop-blur-md border border-gray-200 shadow-lg transition-all'>
           <div className='flex-1 flex flex-col gap-2'>
            <label className='font-satoshi font-bold text-gray-700 text-xs tracking-wide'>SUMMARY LENGTH</label>
            <select value={summaryLength} onChange={(e) => setSummaryLength(Number(e.target.value))} className='block w-full p-2 text-sm text-gray-900 bg-gray-50/50 rounded-lg border border-gray-300 outline-none'>
              <option value={3}>Short (~3 sentences)</option>
              <option value={5}>Medium (~5 sentences)</option>
              <option value={8}>Detailed (~8 sentences)</option>
            </select>
          </div>
          <div className='flex-1 flex flex-col gap-2'>
            <label className='font-satoshi font-bold text-gray-700 text-xs tracking-wide'>LANGUAGE</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className='block w-full p-2 text-sm text-gray-900 bg-gray-50/50 rounded-lg border border-gray-300 outline-none'>
              <option value="en">🇺🇸 English</option>
              <option value="hi">🇮🇳 Hindi</option>
              <option value="pa">🇮🇳 Punjabi</option>
              <option value="gu">🇮🇳 Gujarati</option>
              <option value="es">🇪🇸 Spanish</option>
            </select>
          </div>
        </div>

        {allArticles.length > 0 && (
          <div className="flex justify-between items-center px-2">
            <h2 className="font-satoshi font-bold text-gray-600 text-sm">Recent Summaries</h2>
            <button onClick={clearHistory} className="text-red-500 text-xs font-bold hover:underline">Clear All</button>
          </div>
        )}
        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {allArticles.map((item, index) => (
            <div key={`link-${index}`} onClick={() => {setArticle(item); setViewMode("summary");}} className="link_card group">
              <div className="copy_btn" onClick={(e) => { e.stopPropagation(); handleCopy(item.url); }}>
                <img src={copied === item.url ? tick : copy} alt="copy_icon" className="w-[40%] h-[40%] object-contain" />
              </div>
              <p className="flex-1 font-satoshi text-blue-700 font-medium text-sm truncate pr-2">
                {item.url} <span className="ml-2 text-[10px] text-gray-400">({item.lang})</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="my-10 max-w-full flex justify-center items-center">
        {(isFetching || isHFLoading) ? (
          <img src={loader} alt="loader" className="w-20 h-20 object-contain" />
        ) : error ? (
          <div className="flex flex-col items-center gap-2">
            <p className="font-inter font-bold text-black text-center">
              Primary API Limit Reached.
            </p>
            <span className="text-orange-600 font-satoshi text-sm text-center">
              Don't worry! Switch to <b>"Paste Text"</b> mode to keep summarizing.
            </span>
          </div>
        ) : (
          article.summary && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h2 className="font-satoshi font-bold text-gray-600 text-xl">
                  Article <span className="blue_gradient">Summary</span>
                </h2>
                {/* --- UPDATED BUTTON COLOR COMBINATION --- */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleCopySummary(article.summary)} 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white/40 backdrop-blur-sm text-gray-600 text-xs font-medium hover:bg-white/80 transition-all shadow-sm"
                  >
                    <img src={copiedSummary ? tick : copy} alt="copy" className="w-3 h-3 object-contain" />
                    {copiedSummary ? "Copied!" : "Copy"}
                  </button>

                  <button 
                    onClick={() => setViewMode(viewMode === "summary" ? "keypoints" : "summary")} 
                    className="px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold shadow-md hover:shadow-lg hover:opacity-90 transition-all"
                  >
                    {viewMode === "summary" ? "✨ Key Points" : "📝 Full Summary"}
                  </button>

                  <button 
                    onClick={downloadPDF} 
                    className="px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-600 text-white text-xs font-bold shadow-md hover:shadow-lg hover:opacity-90 transition-all"
                  >
                    PDF ⬇️
                  </button>
                </div>
              </div>

              <div id="summary_result" className="summary_box">
                {viewMode === "keypoints" ? (
                  <div className="animate-in fade-in duration-500">
                    <h3 className="font-satoshi font-bold text-gray-700 mb-2">✨ Key Points</h3>
                    <ul className="list-disc ml-5 space-y-1">
                      {article.summary.split('. ').slice(0, 3).map((point, i) => (
                        <li key={i} className="font-inter text-sm text-gray-600 leading-tight">{point.replace('.', '')}.</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    <h3 className="font-satoshi font-bold text-gray-700 mb-2">📝 Full Summary</h3>
                    <p className="font-inter font-medium text-sm text-gray-700 leading-relaxed">{article.summary}</p>
                  </div>
                )}
                <div className="mt-4 pt-2 border-t border-gray-100 text-[10px] text-gray-400 text-right">
                  Generated by Sumz AI • {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
};

export default Demo;