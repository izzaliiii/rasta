/* ============================================================================
 * Rasta | Islamabad & Rawalpindi government bus network dataset
 * ----------------------------------------------------------------------------
 * SHIPS AS PLAIN JAVASCRIPT ON PURPOSE.
 * A .js file assigning to window works when index.html is opened directly from
 * disk (file://), where fetch() of a local .json file would be blocked by CORS.
 * That is what makes this app work with no server and no build step.
 *
 * ============================ DATA CONFIDENCE ==============================
 * Every line and station carries a `confidence` field. Read it as "how well is
 * this verified", not "how good is the bus".
 *
 * Topology (which stops sit on which line, in what order) was cross-checked
 * against multiple independent sources, and conflicts are surfaced to the user
 * through SERVICE_ALERTS and meta.knownGaps rather than quietly resolved.
 * Coordinates are APPROXIMATE points placed on the road corridor by hand. They
 * drive the time estimates, so a coordinate error shows up directly as a wrong
 * journey time. See tests/calibrate.js, which checks the geometry.
 *
 * No GTFS feed, no real-time API and no open data portal exists for these
 * services as of 2026-10. Anything resembling "live" timing cannot be shipped
 * honestly, and this app does not pretend otherwise.
 * ==========================================================================*/

(function () {
  'use strict';

  var STATIONS = {

    /* ================= RED LINE: Saddar -> Pak Secretariat =================
     * North from Saddar along Murree Road through Rawalpindi, over Faizabad
     * Interchange, then up the Kashmir Highway corridor into Islamabad and the
     * Red Zone. 24 stops, matching the operator's published station count. */
    saddar: {
      name: 'Saddar', nameUr: 'صدر', area: 'Saddar', city: 'Rawalpindi',
      coord: [33.5982, 73.0483], interchange: [],
      landm: 'Saddar Bazaar and Raja Bazaar : Red Line western terminus',
      confidence: 'high'
    },
    marrir_chowk: {
      name: 'Marrir Chowk', area: 'Marrir', city: 'Rawalpindi',
      coord: [33.6030, 73.0518], interchange: [],
      landm: 'Marrir Chowk, Murree Road', confidence: 'medium'
    },
    liaquat_bagh: {
      name: 'Liaqat National Bagh', nameUr: 'لیاقت باغ', area: 'Liaquat Bagh', city: 'Rawalpindi',
      coord: [33.6072, 73.0552], interchange: [],
      landm: 'Liaquat National Bagh park', confidence: 'high'
    },
    committee_chowk: {
      name: 'Committee Chowk', area: 'Committee Chowk', city: 'Rawalpindi',
      coord: [33.6112, 73.0587], interchange: [],
      landm: 'Committee Chowk, Murree Road', confidence: 'high'
    },
    waris_khan: {
      name: 'Waris Khan', area: 'Waris Khan', city: 'Rawalpindi',
      coord: [33.6158, 73.0625], interchange: [],
      landm: 'Waris Khan, Murree Road', confidence: 'medium'
    },
    chandni_chowk: {
      name: 'Chandni Chowk', area: 'Chandni Chowk', city: 'Rawalpindi',
      coord: [33.6206, 73.0667], interchange: [],
      landm: 'Chandni Chowk flyover on Murree Road', confidence: 'high'
    },
    rehmanabad: {
      name: 'Rehmanabad', area: 'Rehmanabad', city: 'Rawalpindi',
      coord: [33.6252, 73.0703], interchange: [],
      landm: 'Rehmanabad, Murree Road', confidence: 'medium'
    },
    sixth_road: {
      name: '6th Road', area: '6th Road', city: 'Rawalpindi',
      coord: [33.6300, 73.0742], interchange: [],
      landm: '6th Road junction, Murree Road', confidence: 'medium'
    },
    shamsabad: {
      name: 'Shamsabad', area: 'Shamsabad', city: 'Rawalpindi',
      coord: [33.6346, 73.0779], interchange: [],
      landm: 'Shamsabad, Murree Road', confidence: 'medium'
    },
    faizabad: {
      name: 'Faizabad', nameUr: 'فیض آباد', area: 'Faizabad', city: 'Islamabad',
      coord: [33.6396, 73.0817], interchange: [],
      landm: 'Faizabad Interchange, on the Rawalpindi-Islamabad boundary',
      confidence: 'high'
    },
    ijp_road: {
      name: 'IJP Road', area: 'IJP Road', city: 'Islamabad',
      coord: [33.6451, 73.0831], interchange: [],
      landm: 'IJP Road junction with Murree Road', confidence: 'medium'
    },
    potohar: {
      name: 'Potohar', area: 'Potohar', city: 'Islamabad',
      coord: [33.6510, 73.0819], interchange: [],
      landm: 'Potohar, Kashmir Highway corridor', confidence: 'low'
    },
    khayaban_e_johar: {
      name: 'Khayaban-e-Johar', area: 'Khayaban-e-Johar', city: 'Islamabad',
      coord: [33.6572, 73.0802], interchange: [],
      landm: 'Khayaban-e-Johar', confidence: 'low'
    },
    faiz_ahmad_faiz: {
      name: 'Faiz Ahmad Faiz', nameUr: 'فیض احمد فیض', area: 'H-8 / near Zero Point', city: 'Islamabad',
      coord: [33.6641, 73.0776], interchange: ['orange'],
      landm: 'Peshawar Morr Interchange area. Key change point for the Orange Line to the airport',
      confidence: 'high'
    },
    kashmir_highway: {
      name: 'Kashmir Highway', area: 'Kashmir Highway / G-9', city: 'Islamabad',
      coord: [33.6700, 73.0760], interchange: [],
      landm: 'Kashmir Highway / Srinagar Highway junction', confidence: 'medium'
    },
    chaman: {
      name: 'Chaman', area: 'G-6 / Chaman', city: 'Islamabad',
      coord: [33.6801, 73.0631], interchange: [],
      landm: 'Chaman, G-6', confidence: 'medium'
    },
    ibn_e_sina: {
      name: 'Ibn-e-Sina', area: 'Blue Area / G-6', city: 'Islamabad',
      coord: [33.6843, 73.0574], interchange: [],
      landm: 'Ibn-e-Sina Road', confidence: 'medium'
    },
    katchery: {
      name: 'Katchery', nameUr: 'کچہری', area: 'F-8 / Katchery', city: 'Islamabad',
      coord: [33.6889, 73.0538], interchange: [],
      landm: 'District courts and Katchery Chowk', confidence: 'medium'
    },
    pims: {
      name: 'PIMS', area: 'G-8 / PIMS', city: 'Islamabad',
      coord: [33.6930, 73.0480], interchange: ['blue', 'green'],
      landm: 'Pakistan Institute of Medical Sciences, change point for the Blue and Green Lines',
      confidence: 'high'
    },
    stock_exchange: {
      name: 'Stock Exchange', area: 'Blue Area / Jinnah Avenue', city: 'Islamabad',
      coord: [33.7013, 73.0532], interchange: [],
      landm: 'Islamabad Stock Exchange, Blue Area', confidence: 'medium'
    },
    seventh_avenue: {
      name: '7th Avenue', area: 'Blue Area / 7th Avenue', city: 'Islamabad',
      coord: [33.7079, 73.0635], interchange: [],
      landm: '7th Avenue, Blue Area', confidence: 'medium'
    },
    shaheed_e_millat: {
      name: 'Shaheed-e-Millat', area: 'Blue Area / G-6', city: 'Islamabad',
      coord: [33.7145, 73.0746], interchange: [],
      landm: 'Shaheed-e-Millat Road, Blue Area', confidence: 'medium'
    },
    parade_ground: {
      name: 'Parade Ground', area: 'Red Zone / Parade Ground', city: 'Islamabad',
      coord: [33.7217, 73.0869], interchange: [],
      landm: 'Parade Ground, near the Red Zone', confidence: 'medium'
    },
    pak_secretariat: {
      name: 'Pak Secretariat', nameUr: 'پاک سیکرٹریٹ', area: 'Red Zone', city: 'Islamabad',
      coord: [33.7306, 73.0970], interchange: [],
      landm: 'Pakistan Secretariat, Red Line eastern terminus',
      confidence: 'high'
    },

    /* ============================ ORANGE LINE ==============================
     * Faiz Ahmad Faiz west along the Srinagar Highway past NUST and Golra,
     * out to Islamabad International Airport. 9 stops. */
    nha: {
      name: 'NHA', area: 'G-9 / NHA', city: 'Islamabad',
      coord: [33.6620, 73.0560], interchange: [],
      landm: 'National Highway Authority headquarters', confidence: 'medium'
    },
    g10: {
      name: 'G-10 / High Court', area: 'G-10', city: 'Islamabad',
      coord: [33.6673, 73.0327], interchange: [],
      landm: 'G-10 Markaz and the Islamabad High Court', confidence: 'medium'
    },
    police_foundation: {
      name: 'Police Foundation', area: 'G-10 / G-11', city: 'Islamabad',
      coord: [33.6615, 73.0120], interchange: [],
      landm: 'Police Foundation housing', confidence: 'low'
    },
    nust: {
      name: 'NUST', nameUr: 'نسٹ', area: 'H-12 / NUST', city: 'Islamabad',
      coord: [33.6477, 72.9940], interchange: [],
      landm: 'National University of Sciences and Technology, H-12',
      confidence: 'high'
    },
    g13: {
      name: 'G-13', area: 'G-13', city: 'Islamabad',
      coord: [33.6487, 72.9691], interchange: [],
      landm: 'G-13 sector', confidence: 'medium'
    },
    golra: {
      name: 'Golra Morr', area: 'Golra / G-13-G-14', city: 'Islamabad',
      coord: [33.6588, 72.9583], interchange: [],
      landm: 'Golra Morr and Golra railway station area', confidence: 'medium'
    },
    n5: {
      name: 'N-5', area: 'N-5 / Sangjani', city: 'Islamabad',
      coord: [33.6460, 72.9229], interchange: [],
      landm: 'N-5 National Highway. Some sources run a separate shuttle from here to the airport',
      confidence: 'low'
    },
    airport: {
      name: 'Islamabad International Airport', area: 'Fateh Jang Road', city: 'Islamabad',
      coord: [33.5607, 72.8516], interchange: [],
      landm: 'Islamabad International Airport : Orange Line western terminus',
      confidence: 'high'
    },

    /* ===================== BLUE LINE: PIMS -> Gulberg ======================
     * South from PIMS through G-8 and the G/H sectors, then down the Islamabad
     * Expressway through Sohan and Koral to Gulberg. 14 stops. */
    blue_childrens: {
      name: "Children's Hospital", area: 'G-8 / Children’s Hospital', city: 'Islamabad',
      coord: [33.6905, 73.0532], interchange: [],
      landm: "Children's Hospital, G-8", confidence: 'low'
    },
    blue_g7g8: {
      name: 'G-7 / G-8', area: 'G-7 / G-8', city: 'Islamabad',
      coord: [33.6846, 73.0615], interchange: [],
      landm: 'Between G-7 and G-8', confidence: 'low'
    },
    h8_shakarparian: {
      name: 'H-8 / Shakarparian', area: 'H-8 / Shakarparian', city: 'Islamabad',
      coord: [33.6800, 73.0753], interchange: [],
      landm: 'H-8 and the Shakarparian hills', confidence: 'low'
    },
    i8_parade_ground: {
      name: 'I-8 / Parade Ground', area: 'I-8', city: 'Islamabad',
      coord: [33.6695, 73.0828], interchange: [],
      landm: 'I-8 sector. Not the same stop as the Red Line’s Parade Ground',
      confidence: 'low'
    },
    sohan: {
      name: 'Sohan', area: 'Sohan', city: 'Islamabad',
      coord: [33.6340, 73.0827], interchange: [],
      landm: 'Sohan Interchange on the Islamabad Expressway', confidence: 'medium'
    },
    dhoke_kala_khan: {
      name: 'Dhoke Kala Khan', area: 'Dhoke Kala Khan', city: 'Rawalpindi',
      coord: [33.6278, 73.0878], interchange: [],
      landm: 'Dhoke Kala Khan, expressway corridor', confidence: 'low'
    },
    iqbal_town: {
      name: 'Iqbal Town', area: 'Iqbal Town', city: 'Islamabad',
      coord: [33.6212, 73.0955], interchange: [],
      landm: 'Iqbal Town, expressway corridor', confidence: 'low'
    },
    kuri_road: {
      name: 'Kuri Road', area: 'Kuri Road', city: 'Islamabad',
      coord: [33.6147, 73.1027], interchange: [],
      landm: 'Kuri Road junction with the Islamabad Expressway', confidence: 'low'
    },
    zia_masjid: {
      name: 'Zia Masjid', area: 'Zia Masjid', city: 'Islamabad',
      coord: [33.6080, 73.1096], interchange: [],
      landm: 'Zia Masjid, expressway corridor', confidence: 'low'
    },
    fazaia: {
      name: 'Fazaia Colony', area: 'Fazaia Colony', city: 'Rawalpindi',
      coord: [33.5924, 73.1213], interchange: [],
      landm: 'Fazaia Housing Scheme, near the expressway', confidence: 'low'
    },
    lehtrar_khanna: {
      name: 'Lehtrar / Khanna', area: 'Lehtrar Road / Khanna Pul', city: 'Rawalpindi',
      coord: [33.6021, 73.1166], interchange: [],
      landm: 'Lehtrar Road junction. Some sources list this as “Khanna Pul”',
      confidence: 'low'
    },
    gangal: {
      name: 'Gangal', area: 'Gangal', city: 'Islamabad',
      coord: [33.5835, 73.1250], interchange: [],
      landm: 'Gangal, Islamabad Expressway', confidence: 'low'
    },
    koral: {
      name: 'Koral Town', area: 'Koral', city: 'Islamabad',
      coord: [33.5708, 73.1317], interchange: [],
      landm: 'Koral Interchange on the Islamabad Expressway', confidence: 'medium'
    },
    gulberg: {
      name: 'Gulberg', area: 'Gulberg Greens', city: 'Islamabad',
      coord: [33.5600, 73.1550], interchange: [],
      landm: 'Gulberg Greens : Blue Line southern terminus', confidence: 'medium'
    },

    /* ==================== GREEN LINE: PIMS -> Barakahu ====================
     * Across the city from PIMS through Aabpara and the Diplomatic Enclave
     * side, east to Barakahu. 12 stops. */
    green_childrens: {
      name: "Children's Hospital", area: 'G-8 / Children’s Hospital', city: 'Islamabad',
      coord: [33.6913, 73.0552], interchange: [],
      landm: "Children's Hospital, G-8", confidence: 'low'
    },
    green_g7g8: {
      name: 'G-7 / G-8', area: 'G-7 / G-8', city: 'Islamabad',
      coord: [33.6871, 73.0630], interchange: [],
      landm: 'Between G-7 and G-8', confidence: 'low'
    },
    cda_stop: {
      name: 'CDA / Fire Brigade HQ', area: 'G-6 / CDA', city: 'Islamabad',
      coord: [33.6907, 73.0651], interchange: [],
      landm: 'Capital Development Authority and Fire Brigade headquarters',
      confidence: 'medium'
    },
    aabpara: {
      name: 'Aabpara', area: 'G-6 / Aabpara', city: 'Islamabad',
      coord: [33.6974, 73.0724], interchange: [],
      landm: 'Aabpara Market, G-6', confidence: 'medium'
    },
    foreign_office: {
      name: 'Foreign Office', area: 'G-5 / Foreign Office', city: 'Islamabad',
      coord: [33.7050, 73.0832], interchange: [],
      landm: 'Ministry of Foreign Affairs', confidence: 'medium'
    },
    lake_view: {
      name: 'Lake View Point', area: 'Rawal Lake', city: 'Islamabad',
      coord: [33.7015, 73.1121], interchange: [],
      landm: 'Lake View Park on the shore of Rawal Lake', confidence: 'medium'
    },
    diplomatic_enclave: {
      name: 'Diplomatic Enclave', area: 'Diplomatic Enclave', city: 'Islamabad',
      coord: [33.7186, 73.1264], interchange: [],
      landm: 'Diplomatic Enclave. Listed by only one source : verify locally',
      confidence: 'low'
    },
    malpur: {
      name: 'Malpur', area: 'Malpur / Bari Imam', city: 'Islamabad',
      coord: [33.7269, 73.1358], interchange: [],
      landm: 'Malpur, towards Bari Imam', confidence: 'medium'
    },
    bari_imam_link: {
      name: 'Bari Imam Link Road', area: 'Bari Imam', city: 'Islamabad',
      coord: [33.7350, 73.1450], interchange: [],
      landm: 'Bari Imam Link Road. Listed by only one source, verify locally',
      confidence: 'low'
    },
    shahdara: {
      name: 'Shahdara', area: 'Shahdara / Korang', city: 'Islamabad',
      coord: [33.7374, 73.1604], interchange: [],
      landm: 'Shahdara, Korang River side', confidence: 'medium'
    },
    barakahu: {
      name: 'Barakahu', nameUr: 'بھارہ کہو', area: 'Barakahu', city: 'Islamabad',
      coord: [33.7330, 73.1861], interchange: [],
      landm: 'Bhara Kahu, Green Line eastern terminus', confidence: 'high'
    }
  };

  /* ------------------------------------------------------------------------
   * `stations` is an ORDERED id list: the sequence of stops travelling
   * `from` -> `to`. The reverse direction is the same list walked backwards,
   * so it is never duplicated here.
   * ---------------------------------------------------------------------- */
  var LINES = [
    {
      id: 'red',
      name: 'Metro Bus Red Line',
      shortName: 'Red Line',
      nameUr: 'میٹرو بس ریڈ لائن',
      operator: 'Punjab Mass Transit Authority (PMA)',
      color: '#c8102e',
      textOnColor: '#ffffff',
      from: 'saddar',
      to: 'pak_secretariat',
      cities: ['Rawalpindi', 'Islamabad'],
      stations: [
        'saddar', 'marrir_chowk', 'liaquat_bagh', 'committee_chowk', 'waris_khan',
        'chandni_chowk', 'rehmanabad', 'sixth_road', 'shamsabad', 'faizabad',
        'ijp_road', 'potohar', 'khayaban_e_johar', 'faiz_ahmad_faiz',
        'kashmir_highway', 'chaman', 'ibn_e_sina', 'katchery', 'pims',
        'stock_exchange', 'seventh_avenue', 'shaheed_e_millat', 'parade_ground',
        'pak_secretariat'
      ],
      publishedLengthKm: 22.5,
      timings: {
        firstDeparture: '06:15',
        lastDeparture: '21:00',
        peakHeadwayMin: 3,
        offPeakHeadwayMin: 6,
        days: 'Daily',
        note: 'The most frequent line in the network. The last bus has been brought ' +
              'forward to 21:00 under an economy measure, so do not rely on the older ' +
              '22:00 figure still shown on some websites.'
      },
      fare: {
        type: 'flat',
        amountPkr: 40,
        confidence: 'medium',
        note: 'Raised from Rs 30 to Rs 40 in March 2026. Green Transport Card holders pay ' +
              'Rs 25. Note that the operator’s own website still displays the old Rs 30 fare.'
      },
      confidence: 'high',
      sources: [
        'https://en.wikipedia.org/wiki/Rawalpindi%E2%80%93Islamabad_Metrobus',
        'https://pma.punjab.gov.pk/operating-hours'
      ]
    },

    {
      id: 'orange',
      name: 'Orange Line BRT',
      shortName: 'Orange Line',
      nameUr: 'اورنج لائن',
      operator: 'Capital Development Authority (CDA) / CMTA',
      color: '#e8710a',
      textOnColor: '#ffffff',
      from: 'faiz_ahmad_faiz',
      to: 'airport',
      cities: ['Islamabad'],
      stations: [
        'faiz_ahmad_faiz', 'nha', 'g10', 'police_foundation', 'nust', 'g13',
        'golra', 'n5', 'airport'
      ],
      publishedLengthKm: null,
      timings: {
        firstDeparture: '06:00',
        lastDeparture: '22:00',
        peakHeadwayMin: 5,
        offPeakHeadwayMin: 10,
        days: 'Daily',
        note: 'The airport service. Sources disagree on whether it runs through to the ' +
              'terminal or stops at N-5 with a separate shuttle onward, so confirm before ' +
              'an airport run. Allow well over an hour from the city centre.'
      },
      fare: {
        type: 'flat',
        amountPkr: 50,
        confidence: 'low',
        note: 'Rs 50 for the line. A separate express service on the final leg to the ' +
              'airport is reported at Rs 90.'
      },
      confidence: 'medium',
      sources: ['https://en.wikipedia.org/wiki/Rawalpindi%E2%80%93Islamabad_Metrobus']
    },

    {
      id: 'blue',
      name: 'Blue Line BRT',
      shortName: 'Blue Line',
      nameUr: 'بلیو لائن',
      operator: 'Capital Development Authority (CDA) / CMTA',
      color: '#1668c1',
      textOnColor: '#ffffff',
      from: 'pims',
      to: 'gulberg',
      cities: ['Islamabad', 'Rawalpindi'],
      stations: [
        'pims', 'blue_childrens', 'blue_g7g8', 'h8_shakarparian',
        'i8_parade_ground', 'sohan', 'dhoke_kala_khan', 'iqbal_town',
        'kuri_road', 'zia_masjid', 'lehtrar_khanna', 'fazaia', 'gangal',
        'koral', 'gulberg'
      ],
      publishedLengthKm: null,
      timings: {
        firstDeparture: '06:00',
        lastDeparture: '22:00',
        peakHeadwayMin: 6,
        offPeakHeadwayMin: 10,
        days: 'Daily',
        note: 'Runs from PIMS down the Islamabad Expressway to Gulberg. Stops are spread ' +
              'out, so this is a slow way to cross the city.'
      },
      fare: {
        type: 'flat',
        amountPkr: 50,
        confidence: 'low',
        note: 'Fare not independently confirmed since the 2025 changes. Check at the station.'
      },
      confidence: 'medium',
      sources: ['https://en.wikipedia.org/wiki/Rawalpindi%E2%80%93Islamabad_Metrobus']
    },

    {
      id: 'green',
      name: 'Green Line BRT',
      shortName: 'Green Line',
      nameUr: 'گرین لائن',
      operator: 'Capital Development Authority (CDA) / CMTA',
      color: '#0f9d58',
      textOnColor: '#ffffff',
      from: 'pims',
      to: 'barakahu',
      cities: ['Islamabad'],
      stations: [
        'pims', 'green_childrens', 'green_g7g8', 'cda_stop', 'aabpara',
        'foreign_office', 'lake_view', 'diplomatic_enclave', 'malpur',
        'bari_imam_link', 'shahdara', 'barakahu'
      ],
      publishedLengthKm: null,
      timings: {
        firstDeparture: '06:00',
        lastDeparture: '22:00',
        peakHeadwayMin: 6,
        offPeakHeadwayMin: 10,
        days: 'Daily',
        note: 'Crosses the city from PIMS out to Barakahu. Sources disagree on the exact ' +
              'stop list, so treat individual stops as indicative. This is NOT the airport ' +
              'line : that is the Orange Line.'
      },
      fare: {
        type: 'flat',
        amountPkr: 50,
        confidence: 'low',
        note: 'Fare not independently confirmed since the 2025 changes. Check at the station.'
      },
      confidence: 'medium',
      sources: ['https://en.wikipedia.org/wiki/Rawalpindi%E2%80%93Islamabad_Metrobus']
    }
  ];

  /* ------------------------------------------------------------------------
   * SERVICE_ALERTS : disruptions and unresolved conflicts that affect travel
   * TODAY. These are shown prominently in the app. Nothing goes in here
   * without a date and a stated confidence, because an unverified alert that
   * makes someone miss a bus is worse than no alert at all.
   * ---------------------------------------------------------------------- */
  var SERVICE_ALERTS = [
    {
      id: 'red-suspension-2026-10',
      severity: 'high',
      lineIds: ['red'],
      date: '2026-10-11',
      title: 'Red Line reportedly suspended between Kashmir Highway and Pak Secretariat',
      body: 'A news report on 11 October 2026 said the district administration suspended ' +
            'Red Line service on the northern section between Kashmir Highway and Pak ' +
            'Secretariat, with buses still running from Saddar as far as Faiz Ahmad Faiz. ' +
            'We could not confirm this with the operator and do not know whether it is ' +
            'still in force. If you are travelling to the Red Zone, Secretariat or Blue ' +
            'Area, confirm the service is running before you set out.',
      confidence: 'low',
      source: 'https://dailyausaf.com/en/pakistan/metro-bus-service-suspended-between-kashmir-highway-and-pak-secretariat/'
    },
    {
      id: 'last-bus-2100',
      severity: 'medium',
      lineIds: ['red'],
      date: '2026-03-28',
      title: 'Red Line last bus may be 21:00, not 22:00',
      body: 'A March 2026 austerity measure reportedly brought the last Red Line departure ' +
            'forward to 21:00 from both ends, with stations closing around 21:40. Several ' +
            'websites still publish 22:00. The app shows 21:00 as the last departure. Do ' +
            'not plan a late journey without checking.',
      confidence: 'low',
      source: 'https://dailyausaf.com/en/pakistan/metro-bus-service-suspended-at-9-pm/'
    },
    {
      id: 'fare-conflict-red',
      severity: 'low',
      lineIds: ['red'],
      date: '2026-03-26',
      title: 'Red Line fare conflict: Rs 40 or Rs 30?',
      body: 'The Red Line fare rose from Rs 30 to Rs 40 on 26 March 2026, but the operator’s ' +
            'own fare page still shows Rs 30. The app shows Rs 40. Bring small change.',
      confidence: 'medium',
      source: 'https://pma.punjab.gov.pk/fare-policy'
    },
    {
      id: 'pims-transfer-walk',
      severity: 'medium',
      lineIds: ['red', 'blue', 'green'],
      date: '2026-10-12',
      title: 'Changing lines at PIMS means a short walk, not a same-platform change',
      body: 'The Red Line calls at “PIMS”, while the Blue and Green Lines call at a separate ' +
            'nearby stop. Sources differ on how far apart they are, and we have no surveyed ' +
            'walking distance. Allow extra time when changing lines here : it is the busiest ' +
            'interchange in the network.',
      confidence: 'medium',
      source: null
    },
    {
      id: 'green-incomplete',
      severity: 'medium',
      lineIds: ['green'],
      date: '2026-10-12',
      title: 'Green Line stop list is disputed between sources',
      body: 'Four sources give four different Green Line stop lists, ranging from 9 to 12 ' +
            'stops. The app uses the fullest list but marks the disputed stops as low ' +
            'confidence. Verify stops locally before relying on one you have not used before.',
      confidence: 'high',
      source: null
    }
  ];

  var META = {
    version: '0.3.0',
    dataAsOf: '2026-10-12',
    city: 'Islamabad & Rawalpindi',
    currency: 'PKR',

    /**
     * Average door-to-door speed used for time estimates, in km/h. Urban BRT
     * with stops, signals and congestion. Deliberately conservative: an app
     * that under-promises and arrives early beats one that makes people late.
     */
    averageSpeedKmph: 18,
    /** Minutes spent at each intermediate stop (dwell). */
    dwellMinutes: 0.5,
    /** Minutes to change lines at an interchange (walk + wait). */
    transferPenaltyMin: 8,

    /** Straight-line distance underestimates real road distance. */
    roadDetourFactor: 1.25,

    disclaimer:
      'Rasta shows published route information and scheduled service windows. ' +
      'It is not a live tracker: bus positions and actual arrival times are not ' +
      'available to us. Timings are indicative. Always confirm your last ' +
      'return trip before you travel, especially in the evening.',

    knownGaps: [
      'No live bus positions. There is no GTFS feed, no real-time API and no open data portal for these services, so a live arrival time cannot honestly be shown.',
      'Sources give four different Green Line stop lists, from 9 to 12 stops. The disputed stops are marked low confidence.',
      'Fares changed repeatedly through 2025 and 2026 and some are unconfirmed. The Red Line fare also conflicts with the operator’s own website.',
      'No per-station arrival times or segment travel times are published, so journey times are modelled from distance, not measured.',
      'Changing lines at PIMS involves a walk between two separate stops. No surveyed walking distance exists.',
      'Stop names differ between signage, maps and what conductors say. This app uses the most widely recognised name.',
      'Feeder routes, the CDA Electric Bus Service and the separate express airport service are not yet included : that is the biggest gap for journeys that do not start on a BRT corridor.',
      'Stop coordinates are approximate points on the road corridor, not surveyed platform positions. They drive the time estimates, so treat every journey time as an estimate.'
    ]
  };

  window.RASTA_DATA = {
    meta: META,
    stations: STATIONS,
    lines: LINES,
    serviceAlerts: SERVICE_ALERTS
  };
})();
