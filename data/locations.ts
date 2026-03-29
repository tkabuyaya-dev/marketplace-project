/**
 * NUNULIA — Communes/Cities by Province
 *
 * Structure: countryId → province → communes[]
 * Currently covers: Burundi (bi) + RDC (cd)
 * Other countries fallback to free text input.
 */

export const COMMUNES_BY_PROVINCE: Record<string, Record<string, string[]>> = {
  // ═══════════════════════════════════════════
  // 🇧🇮  BURUNDI
  // ═══════════════════════════════════════════
  bi: {
    'Bubanza': [
      'Bubanza', 'Gihanga', 'Mpanda', 'Musigati', 'Rugazi',
    ],
    'Bujumbura Mairie': [
      'Buterere', 'Buyenzi', 'Bwiza', 'Cibitoke', 'Gihosha',
      'Kamenge', 'Kanyosha', 'Kinindo', 'Kinama', 'Musaga',
      'Mugoboka', 'Muha', 'Mukaza', 'Ngagara', 'Nyakabiga',
      'Rohero', 'Mutanga Nord', 'Mutanga Sud', 'Kiriri',
    ],
    'Bujumbura Rural': [
      'Isale', 'Kabezi', 'Kanyosha', 'Mubimbi', 'Mugongomanga',
      'Mukike', 'Mutambu', 'Mutimbuzi', 'Nyabiraba',
    ],
    'Bururi': [
      'Bururi', 'Matana', 'Mugamba', 'Rutovu', 'Songa', 'Buyengero',
    ],
    'Cankuzo': [
      'Cankuzo', 'Cendajuru', 'Gisagara', 'Kigamba', 'Mishiha',
    ],
    'Cibitoke': [
      'Buganda', 'Bukinanyana', 'Mabayi', 'Mugina', 'Murwi', 'Rugombo',
    ],
    'Gitega': [
      'Gitega', 'Bugendana', 'Bukirasazi', 'Buraza', 'Giheta',
      'Gishubi', 'Itaba', 'Makebuko', 'Mutaho', 'Nyanrusange', 'Ryansoro',
    ],
    'Karuzi': [
      'Karuzi', 'Bugenyuzi', 'Buhiga', 'Gihogazi', 'Gitaramuka',
      'Mutumba', 'Nyabikere', 'Shombo',
    ],
    'Kayanza': [
      'Kayanza', 'Butaganzwa', 'Gahombo', 'Gatara', 'Kabarore',
      'Matongo', 'Muhanga', 'Muruta', 'Rango',
    ],
    'Kirundo': [
      'Kirundo', 'Bugabira', 'Busoni', 'Bwambarangwe', 'Gitobe',
      'Ntega', 'Vumbi',
    ],
    'Makamba': [
      'Makamba', 'Kayogoro', 'Kibago', 'Mabanda', 'Nyanza-Lac', 'Vugizo',
    ],
    'Muramvya': [
      'Muramvya', 'Bukeye', 'Kiganda', 'Mbuye', 'Rutegama',
    ],
    'Muyinga': [
      'Muyinga', 'Buhinyuza', 'Butihinda', 'Gashoho', 'Gasorwe',
      'Giteranyi', 'Mwakiro',
    ],
    'Mwaro': [
      'Mwaro', 'Bisoro', 'Gisozi', 'Kayokwe', 'Ndava', 'Nyabihanga', 'Rusaka',
    ],
    'Ngozi': [
      'Ngozi', 'Busiga', 'Gashikanwa', 'Kiremba', 'Marangara',
      'Mwumba', 'Nyamurenza', 'Ruhororo', 'Tangara',
    ],
    'Rumonge': [
      'Rumonge', 'Bugarama', 'Burambi', 'Buyengero', 'Muhuta',
    ],
    'Rutana': [
      'Rutana', 'Bukemba', 'Giharo', 'Gitanga', 'Mpinga-Kayove', 'Musongati',
    ],
    'Ruyigi': [
      'Ruyigi', 'Butaganzwa', 'Butezi', 'Bweru', 'Gisuru',
      'Kinyinya', 'Nyabitsinda',
    ],
  },

  // ═══════════════════════════════════════════
  // 🇨🇩  RDC (République Démocratique du Congo)
  // ═══════════════════════════════════════════
  cd: {
    'Kinshasa': [
      'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu',
      'Kasa-Vubu', 'Kimbanseke', 'Kinshasa', 'Kintambo', 'Kisenso',
      'Lemba', 'Limete', 'Lingwala', 'Makala', 'Maluku',
      'Masina', 'Matete', 'Mont-Ngafula', 'Ndjili', 'Ngaba',
      'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao',
    ],
    'Nord-Kivu': [
      'Goma', 'Butembo', 'Beni', 'Oicha', 'Lubero',
      'Rutshuru', 'Nyiragongo', 'Masisi', 'Walikale', 'Kiwanja',
      'Kirumba', 'Sake', 'Minova',
    ],
    'Sud-Kivu': [
      'Bukavu', 'Uvira', 'Baraka', 'Kabare', 'Walungu',
      'Kalehe', 'Mwenga', 'Fizi', 'Shabunda', 'Idjwi',
      'Kamituga', 'Lemera', 'Minembwe',
    ],
    'Haut-Katanga': [
      'Lubumbashi', 'Likasi', 'Kipushi', 'Kasumbalesa', 'Kambove',
      'Sakania', 'Mokambo', 'Kapolowe', 'Pweto',
    ],
    'Lualaba': [
      'Kolwezi', 'Dilolo', 'Fungurume', 'Mutshatsha', 'Lubudi',
      'Sandoa', 'Kasaji',
    ],
    'Ituri': [
      'Bunia', 'Aru', 'Mahagi', 'Djugu', 'Irumu',
      'Mambasa', 'Mongbwalu', 'Kilo',
    ],
    'Tshopo': [
      'Kisangani', 'Isangi', 'Yangambi', 'Basoko', 'Opala',
      'Ubundu', 'Bafwasende', 'Banalia',
    ],
    'Kongo Central': [
      'Matadi', 'Boma', 'Muanda', 'Mbanza-Ngungu', 'Lukala',
      'Kisantu', 'Tshela', 'Songololo', 'Seke-Banza', 'Kasangulu',
      'Madimba', 'Moanda',
    ],
    'Haut-Lomami': [
      'Kamina', 'Kabongo', 'Kaniama', 'Malemba-Nkulu', 'Bukama',
    ],
    'Tanganyika': [
      'Kalemie', 'Moba', 'Kongolo', 'Manono', 'Nyunzu', 'Kabalo',
    ],
    'Maniema': [
      'Kindu', 'Kasongo', 'Kabambare', 'Pangi', 'Lubutu', 'Punia', 'Kailo',
    ],
    'Kasaï': [
      'Tshikapa', 'Ilebo', 'Mweka', 'Luebo', 'Dekese', 'Kamonia',
    ],
    'Kasaï Central': [
      'Kananga', 'Luiza', 'Dimbelenge', 'Demba', 'Kazumba',
    ],
    'Kasaï Oriental': [
      'Mbuji-Mayi', 'Kabinda', 'Lodja', 'Tshilenge', 'Miabi', 'Katanda',
    ],
    'Équateur': [
      'Mbandaka', 'Bikoro', 'Basankusu', 'Bolomba', 'Bomongo',
      'Ingende', 'Lotumbe',
    ],
    'Mongala': [
      'Lisala', 'Bumba', 'Bongandanga',
    ],
    'Nord-Ubangi': [
      'Gbadolite', 'Mobayi-Mbongo', 'Yakoma', 'Businga',
    ],
    'Sud-Ubangi': [
      'Gemena', 'Libenge', 'Zongo', 'Budjala', 'Kungu',
    ],
    'Bas-Uélé': [
      'Buta', 'Aketi', 'Ango', 'Bambesa', 'Bondo', 'Poko',
    ],
    'Haut-Uélé': [
      'Isiro', 'Dungu', 'Faradje', 'Watsa', 'Niangara', 'Wamba',
    ],
    'Lomami': [
      'Kabinda', 'Ngandajika', 'Mwene-Ditu', 'Kamiji', 'Lubao',
    ],
    'Kwango': [
      'Kenge', 'Bandundu', 'Kahemba', 'Kasongo-Lunda', 'Feshi', 'Popokabaka',
    ],
    'Kwilu': [
      'Kikwit', 'Idiofa', 'Bulungu', 'Gungu', 'Masi-Manimba', 'Bagata',
    ],
    'Mai-Ndombe': [
      'Inongo', 'Nioki', 'Kiri', 'Kutu', 'Bolobo', 'Mushie', 'Oshwe',
    ],
    'Sankuru': [
      'Lusambo', 'Lodja', 'Lubefu', 'Katako-Kombe', 'Kole',
    ],
    'Tshuapa': [
      'Boende', 'Befale', 'Bokungu', 'Djolu', 'Ikela', 'Monkoto',
    ],
  },
};
