/** Пилотная разметка ФРП: предметы и PDF (только базовый уровень, где применимо). */
const FRP_SUBJECTS = [
  {
    subject: "Математика",
    appAliases: ["Математика", "Алгебра", "Геометрия"],
    files: [
      {
        id: "noo_1-4",
        level: "НОО",
        grades: [1, 2, 3, 4],
        pdf: "docs/frp/НОО/Математика_1-4.pdf",
        out: "src/lib/knowledge/frp/Математика/noo_1-4.md",
      },
      {
        id: "ooo_5-9_базовый",
        level: "ООО",
        grades: [5, 6, 7, 8, 9],
        pdf: "docs/frp/ООО/Математика_5-9_базовый.pdf",
        out: "src/lib/knowledge/frp/Математика/ooo_5-9_базовый.md",
      },
      {
        id: "soo_10-11_базовый",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/Математика_10-11_базовый.pdf",
        out: "src/lib/knowledge/frp/Математика/soo_10-11_базовый.md",
      },
    ],
  },
  {
    subject: "История",
    appAliases: ["История"],
    files: [
      {
        id: "ooo_5-9",
        level: "ООО",
        grades: [5, 6, 7, 8, 9],
        pdf: "docs/frp/ООО/История_5-9.pdf",
        out: "src/lib/knowledge/frp/История/ooo_5-9.md",
      },
      {
        id: "soo_10-11_базовый",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/История_10-11_базовый.pdf",
        out: "src/lib/knowledge/frp/История/soo_10-11_базовый.md",
      },
    ],
  },
  {
    subject: "Обществознание",
    appAliases: ["Обществознание"],
    files: [
      {
        id: "ooo_6-9",
        level: "ООО",
        grades: [6, 7, 8, 9],
        pdf: "docs/frp/ООО/Обществознание_6-9.pdf",
        out: "src/lib/knowledge/frp/Обществознание/ooo_6-9.md",
      },
      {
        id: "soo_10-11_базовый",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/Обществознание_10-11_базовый.pdf",
        out: "src/lib/knowledge/frp/Обществознание/soo_10-11_базовый.md",
      },
    ],
  },
  {
    subject: "Русский язык",
    appAliases: ["Русский язык"],
    files: [
      {
        id: "noo_1-4",
        level: "НОО",
        grades: [1, 2, 3, 4],
        pdf: "docs/frp/НОО/Русский_язык_1-4.pdf",
        out: "src/lib/knowledge/frp/Русский_язык/noo_1-4.md",
      },
      {
        id: "ooo_5-9",
        level: "ООО",
        grades: [5, 6, 7, 8, 9],
        pdf: "docs/frp/ООО/Русский_язык_5-9.pdf",
        out: "src/lib/knowledge/frp/Русский_язык/ooo_5-9.md",
      },
      {
        id: "soo_10-11",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/Русский_язык_10-11.pdf",
        out: "src/lib/knowledge/frp/Русский_язык/soo_10-11.md",
      },
    ],
  },
  {
    subject: "Литература",
    appAliases: ["Литература"],
    files: [
      {
        id: "ooo_5-9",
        level: "ООО",
        grades: [5, 6, 7, 8, 9],
        pdf: "docs/frp/ООО/Литература_5-9.pdf",
        out: "src/lib/knowledge/frp/Литература/ooo_5-9.md",
      },
      {
        id: "soo_10-11_базовый",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/Литература_10-11_базовый.pdf",
        out: "src/lib/knowledge/frp/Литература/soo_10-11_базовый.md",
      },
    ],
  },
  {
    subject: "Информатика",
    appAliases: ["Информатика"],
    files: [
      {
        id: "ooo_7-9_базовый",
        level: "ООО",
        grades: [5, 6, 7, 8, 9],
        pdf: "docs/frp/ООО/Информатика_7-9_базовый.pdf",
        out: "src/lib/knowledge/frp/Информатика/ooo_7-9_базовый.md",
        note: "Для 5–6 классов в приложении используется фрагмент программы 7–9.",
      },
      {
        id: "soo_10-11_базовый",
        level: "СОО",
        grades: [10, 11],
        pdf: "docs/frp/СОО/Информатика_10-11_базовый.pdf",
        out: "src/lib/knowledge/frp/Информатика/soo_10-11_базовый.md",
      },
    ],
  },
];

module.exports = { FRP_SUBJECTS };
