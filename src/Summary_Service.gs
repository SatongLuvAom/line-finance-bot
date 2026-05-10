/**
 * Summary_Service.gs
 * Project, budget, category, and active-job summaries.
 */

function getProjectSummary(jobQuery) {
  try {
    const normalizedJobQuery = normalizeJobAlias_(jobQuery);
    const jobId = buildStableEntityId_("job", normalizedJobQuery);
    const records = getTransactionsByJob(jobId, {
      queryName: "project_summary",
      limit: 1000
    });
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryMap = {};

    records.forEach(function(record) {
      const amount = Number(record.amount || 0);
      const recordType = String(record.type || "expense");
      const category = String(record.category || "อื่นๆ");

      if (recordType === "income") {
        totalIncome += amount;
      } else {
        totalExpense += amount;
        categoryMap[category] = (categoryMap[category] || 0) + amount;
      }
    });

    if (totalIncome === 0 && totalExpense === 0) {
      return { type: "text", text: `ไม่พบข้อมูลโปรเจกต์ '${jobQuery}'` };
    }

    return createProjectSummaryFlex(normalizedJobQuery, totalIncome, totalExpense, categoryMap);
  } catch (err) {
    throw new Error("สรุปงบโปรเจกต์ไม่สำเร็จ: " + err.message);
  }
}


function getActiveJobsThisMonthText_() {
  const monthKey = formatDateToYMD(new Date()).slice(0, 7);
  const records = getTransactionsByMonth(monthKey, {
    queryName: "active_jobs_this_month",
    limit: 1000
  });
  const jobMap = {};

  records.forEach(function(record) {
    const job = record.jobNameNormalized || normalizeJobAlias_(record.job || "งานทั่วไป");
    if (!jobMap[job]) {
      jobMap[job] = {
        job: job,
        count: 0,
        income: 0,
        expense: 0,
        latestDate: ""
      };
    }

    jobMap[job].count += 1;
    if (record.type === "income") {
      jobMap[job].income += record.amount;
    } else {
      jobMap[job].expense += record.amount;
    }
    if (record.date > jobMap[job].latestDate) {
      jobMap[job].latestDate = record.date;
    }
  });

  const jobs = Object.keys(jobMap).map(function(key) {
    return jobMap[key];
  }).sort(function(a, b) {
    if (b.latestDate !== a.latestDate) {
      return b.latestDate.localeCompare(a.latestDate);
    }
    return (b.income + b.expense) - (a.income + a.expense);
  });

  if (!jobs.length) {
    return [
      `งานเดือนนี้ ${monthKey}`,
      "────────────",
      "ยังไม่พบงานที่มีรายการในเดือนนี้"
    ].join("\n");
  }

  const lines = [
    `งานเดือนนี้ ${monthKey}`,
    "────────────",
    ""
  ];

  jobs.slice(0, 20).forEach(function(item, index) {
    const net = item.income - item.expense;
    lines.push(`${index + 1}. ${item.job}`);
    lines.push(`รายการ: ${item.count}`);
    lines.push(`รับ: ฿${item.income.toLocaleString()} | จ่าย: ฿${item.expense.toLocaleString()}`);
    lines.push(`คงเหลือ: ฿${net.toLocaleString()}`);
    lines.push("");
  });

  lines.push("พิมพ์ต่อได้ เช่น:");
  lines.push("สรุปงบ ชื่องาน");
  return lines.join("\n");
}


function checkBudgetAlert(jobName, latestRecord) {
  try {
    const latestAmount = Number(latestRecord && latestRecord.amount || 0);
    const latestType = String(latestRecord && latestRecord.type || "expense");
    if (!jobName || latestType === "income" || latestAmount <= 0) {
      return null;
    }

    const normalizedJobName = normalizeJobAlias_(jobName);
    const jobId = buildStableEntityId_("job", normalizedJobName);
    const records = getTransactionsByJob(jobId, {
      queryName: "budget_alert_job_total",
      limit: 1000
    });
    let total = 0;

    records.forEach(function(record) {
      const recordType = String(record.type || "expense");
      if (recordType !== "income") {
        total += Number(record.amount || 0);
      }
    });

    const previousTotal = Math.max(0, total - latestAmount);
    const previousThresholdLevel = getBudgetThresholdLevel_(previousTotal);
    const currentThresholdLevel = getBudgetThresholdLevel_(total);

    if (currentThresholdLevel > previousThresholdLevel) {
      const thresholdAmount = currentThresholdLevel * 100000;
      return {
        type: "text",
        text: [
          `แจ้งเตือน: โปรเจกต์ ${normalizedJobName} ใช้งบสะสมเกิน ฿${thresholdAmount.toLocaleString()} แล้ว`,
          `ยอดสะสมล่าสุด ฿${total.toLocaleString()}`
        ].join("\n")
      };
    }

    return null;
  } catch (err) {
    logError("checkBudgetAlert.error", err);
    return null;
  }
}

function getBudgetThresholdLevel_(amount) {
  return Math.floor(Number(amount || 0) / 100000);
}


function getMonthlySummary_(dateString) {
  const month = getMonthThai(dateString || formatDateToYMD(new Date()));
  return getActiveJobsThisMonthText_() + "\n\nเดือน: " + month;
}

function getCategorySummary_(records) {
  const map = {};
  (records || []).forEach(function(record) {
    const category = record.category || "อื่นๆ";
    map[category] = (map[category] || 0) + Number(record.amount || 0);
  });
  return map;
}

function buildSummaryText_(title, total, categoryMap) {
  const lines = [String(title || "สรุปงบ"), "ยอดรวม " + formatCurrency_(total || 0), ""];
  Object.keys(categoryMap || {}).forEach(function(category) {
    lines.push("- " + category + ": " + formatCurrency_(categoryMap[category]));
  });
  return lines.join("\n");
}

function buildSummaryFlexData_(title, total, categoryMap) {
  return { title: title, total: total, categoryMap: categoryMap || {} };
}


