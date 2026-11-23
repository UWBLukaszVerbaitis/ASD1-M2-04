# ASD1-M2-04 — Skrzynka pomysłów studenckich

<img src="assets/uwb-filia-wilno-logo.jpg" alt="Filia UwB w Wilnie" height="60">

**Autor:** Łukasz Verbaitis · **Nr albumu:** 93792 · **Kierunek:** Informatyka
**Przedmiot:** Algorytmy i struktury danych I, 2026/2027 · Mini-projekt M2 (praca indywidualna) · **Kod tematu:** ASD1-M2-04 (Inicjatywy)
**Uczelnia:** Filia Uniwersytetu w Białymstoku w Wilnie

Aplikacja zbiera pomysły na życie Filii i pokazuje, które mają największe poparcie. Każde miejsce w rankingu
wynika z jawnej reguły: **liczba głosów malejąco, przy remisie ID rosnąco**. Przy każdym pomyśle widać listę głosów,
z których powstała suma.

## Uruchomienie aplikacji

Czysty HTML + CSS + JavaScript — bez serwera, instalacji, kont i bibliotek.
Wystarczy otworzyć `index.html` w przeglądarce (Chrome, Firefox, Edge).

## Uruchomienie testów

```bash
node tests/run.js      # albo: npm test  (Node.js ≥ 18; kod wyjścia 0 = wszystkie zaliczone)
```

Ten sam zestaw (17 testów) jest w zakładce **Testy** w aplikacji.

## Funkcje (zakres obowiązkowy)

| Wymaganie | Gdzie |
|---|---|
| Dodawanie i edycja pomysłów, zmiana statusu przez operatora | formularz + „Tryb operatora”; `addIdea`, `editIdea`, `setStatus` |
| Pełny opis, filtr kategorii i statusu | karta pomysłu, filtry nad listą |
| Poparcie i wycofanie; najwyżej 1 głos osoby na pomysł | „Popieram” / „Wycofaj”, formularz „Głos ręcznie”; `addVote`, `withdrawVote` |
| Ranking z jawnymi remisami | zakładka *Ranking*; `insertionSort(rankCompare)` |
| Podsumowanie: pomysły w kategoriach, różni głosujący | zakładka *Ranking*; `compute` |
| Usunięcie z potwierdzeniem (usuwa głosy; przed potwierdzeniem bez zmian) | okno dialogowe; `deleteIdea(state, id, confirmed)` |
| Eksport/import JSON z wersją formatu, walidacja całego pliku | zakładka *Dane JSON*; `exportData`, `parseImport` |
| Przykład kontrolny (przycisk + plik) | zakładka *Przykład kontrolny*, `data/przyklad-kontrolny.txt` |
| Tabela „przed → decyzja → po”, liczniki, porównania 10/100/1000 | zakładka *Algorytmy i porównania* |
| Rozszerzenie: historia zmian statusu | karta pomysłu |

## Reguły

* Pomysł: `id`, `title` (1–120), `description` (0–2000), `category` (1–40), `status` ∈ {nowy, w analizie, przyjęty, odrzucony}.
* Głos: `participant` (ID uczestnika demo), `ideaId`. Para jest unikalna; głos na nieistniejący pomysł = błąd.
* ID: wielkie litery A–Z, cyfry, łącznik, 1–20 znaków; niepuste, unikalne, niezmienne.
* Do 1000 pomysłów i 1000 głosów. Walidacja przed zmianą stanu — odrzucona operacja nie zostawia częściowego zapisu.
* Teksty wyświetlane przez `textContent` (wpisany HTML się nie wykonuje).

## Algorytmy (własne, w `src/core.js`)

* `findVote` — wyszukiwanie liniowe **pierwszego** dopasowania pary (uczestnik, pomysł); `findIdea` — po ID.
* `votesForIdea` — przegląd całej listy, **wszystkie** dopasowania → suma głosów i lista na karcie.
* `insertionSort` — sortowanie przez wstawianie (stabilne), liczniki porównań kluczy i przesunięć, opcjonalny zapis kroków.
* `distinctVoters` — różni głosujący (lista widzianych + wyszukiwanie liniowe).

W głównej ścieżce nie ma `Array.prototype.sort` — używa go tylko porównanie (`benchSort`) i testy jako niezależny wzorzec.

| Operacja | Koszt |
|---|---|
| wyszukiwanie pary / ID | 1 … m (brak wyniku = m) |
| zliczanie głosów | Θ(n·m) |
| sortowanie przez wstawianie | n−1 … n(n−1)/2 porównań |

## Przykład kontrolny

Pomysły A, B, C. Głosy: U1→A, U2→B, U3→A, U1→A (ponownie), U1→B; potem U3 wycofuje A.
Wynik: powtórny U1→A odrzucony; przed wycofaniem A=2, B=2, C=0 → A,B,C; po wycofaniu B=2, A=1, C=0 → B,A,C; 2 różne osoby.

## Dane (`data/`)

| Plik | Zawartość |
|---|---|
| `scenariusz-kontrolny.json` | stan po przykładzie kontrolnym |
| `scenariusz-typowy.json` | 8 pomysłów, 16 głosów, 6 osób |
| `scenariusz-graniczny.json` | remisy, ID o długości 1 i 20, HTML w tekście, tytuł 120 znaków |
| `scenariusz-wiekszy.json` | 1000 pomysłów, 1000 głosów (generator z ziarnem 2026) |
| `przyklad-kontrolny.txt` | skrypt działań do wklejenia w zakładce *Przykład kontrolny* |
| `bledny-plik.json` | plik z błędami — import musi go odrzucić bez zmiany danych |

## Struktura projektu

```
index.html             interfejs (6 zakładek)
src/core.js            logika: model, walidacja, algorytmy, JSON, scenariusze (bez DOM)
src/app.js             obsługa interfejsu        src/style.css   styl UwB / Filia w Wilnie
src/tests.js           testy (Node + przeglądarka)  tests/run.js  uruchamianie w terminalu
data/                  scenariusze i pliki do importu
assets/                logo Filii UwB w Wilnie
slides/prezentacja.pdf prezentacja — 10 slajdów (źródło: prezentacja.html)
docs/dokumentacja.pdf  dokumentacja — 10 stron (źródło: dokumentacja.html), docs/img — zrzuty
tools/                 gen-data.js, shots.js, build.js, pdf.js — narzędzia autora (Node + Playwright)
```

## Odtworzenie dokumentów (opcjonalnie)

```bash
npm install && npx playwright install chromium
npm run data     # data/*.json
npm run shots    # 14 sprawdzeń interfejsu w Chromium + zrzuty do docs/img
npm run docs     # slajdy i dokumentacja z rzeczywistych wyników + PDF
```

## Źródła i AI

* Materiały z zajęć ASD I (wyszukiwanie liniowe, sortowanie przez wstawianie); własny projekt M1 (ASD1-M1-12).
* T. H. Cormen i in., *Wprowadzenie do algorytmów*, rozdz. 2.1–2.2.
* MDN Web Docs (`<dialog>`, `textContent`, File API, `localStorage`); GitHub Docs.
* Logo i kolorystyka: materiały Filii Uniwersytetu w Białymstoku w Wilnie.

Szkic kodu, testów i dokumentów przygotowano z pomocą agenta AI (asystenta programistycznego). Weryfikacja: 17 testów
automatycznych, 14 sprawdzeń interfejsu w przeglądarce, ręczne przeliczenie przykładu kontrolnego i tabeli
„przed → decyzja → po”, przegląd zrzutów ekranu.
