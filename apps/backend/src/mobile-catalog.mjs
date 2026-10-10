// Catalog copied from AndroidFiles/lib/models/item_model.dart. Keep these
// equipment records aligned with ItemModel.getInitialCatalog().
export const MOBILE_CATALOG = [
  {
    id: 'item_bike', qrCode: 'EQUIP-002', name: 'Bicycle', category: 'Sports',
    description: 'Durable 21-speed mountain bike with adjustable seat, helmet, and safety reflectors suitable for all terrains.',
    rateType: 'HOURLY', rentalRate: 200, latePenalty: 200,
    pricingProductId: 'bike', imageName: 'Bike.png', isForSale: false
  },
  {
    id: 'item_pickleball', qrCode: 'EQUIP-009', name: 'Pickleball Set', category: 'Sports',
    description: 'Complete set including 4 lightweight graphite paddles, 6 outdoor pickleballs, and a portable net system.',
    rateType: 'HOURLY', rentalRate: 120, latePenalty: 120,
    pricingProductId: 'pickleball-set', imageName: 'Pickleball_Set.png', isForSale: false
  },
  {
    id: 'item_badminton', qrCode: 'EQUIP-001', name: 'Badminton Set', category: 'Sports',
    description: 'Includes 4 steel rackets, 6 durable shuttlecocks, and a quick-setup net for outdoor or indoor court play.',
    rateType: 'HOURLY', rentalRate: 100, latePenalty: 100,
    pricingProductId: 'badminton-set', imageName: 'Badminton_Set.png', isForSale: false
  },
  {
    id: 'item_basketball', qrCode: 'EQUIP-003', name: 'Basketball', category: 'Sports',
    description: 'Official size 7 indoor/outdoor composite leather basketball with deep channels for superior grip and bounce.',
    rateType: 'HOURLY', rentalRate: 50, latePenalty: 50,
    pricingProductId: 'basketball', imageName: 'Basketball.png', isForSale: false
  },
  {
    id: 'item_volleyball', qrCode: 'EQUIP-014', name: 'Volleyball', category: 'Sports',
    description: 'Official regulation size 5 soft-touch leather volleyball ideal for beach or indoor court recreational play.',
    rateType: 'HOURLY', rentalRate: 50, latePenalty: 50,
    pricingProductId: 'volleyball', imageName: 'Volleyball.png', isForSale: false
  },
  {
    id: 'item_cards_deck', qrCode: 'EQUIP-006', name: 'Deck of Cards', category: 'Cards',
    description: 'Standard 52-card poker deck made of plastic-coated cardstock for smooth shuffling and long-lasting durability.',
    rateType: 'FLAT', rentalRate: 50, latePenalty: 10,
    pricingProductId: 'deck-of-cards', imageName: 'Playing_Cards.png', isForSale: true, salePrice: 150
  },
  {
    id: 'item_uno', qrCode: 'EQUIP-013', name: 'Uno Cards', category: 'Cards',
    description: 'Classic Uno card game featuring 112 cards including Wild, Draw Four, and custom rule action cards.',
    rateType: 'FLAT', rentalRate: 100, latePenalty: 20,
    pricingProductId: 'uno-cards', imageName: 'UNO_Cards.png', isForSale: true, salePrice: 300
  },
  {
    id: 'item_bingo', qrCode: 'EQUIP-004', name: 'Bingo Set', category: 'Cards',
    description: 'Bingo Set: Includes master board, cage, numbered balls, and reusable bingo cards for group entertainment.',
    rateType: 'FLAT', rentalRate: 150, latePenalty: 30,
    pricingProductId: 'bingo-cards', imageName: 'Bingo.png', isForSale: true, salePrice: 450
  },
  ...[
    {
      id: 'item_jenga', qrCode: 'EQUIP-007', name: 'Jenga',
      description: 'Includes 54 precision-crafted hardwood blocks for building tower balance games suitable for all ages.',
      imageName: 'Jenga.png'
    },
    {
      id: 'item_scrabble', qrCode: 'EQUIP-012', name: 'Scrabble',
      description: 'Classic Scrabble crossword game with full letter tile set, 4 tile racks, and folding game board.',
      imageName: 'Scrabble.png'
    },
    {
      id: 'item_chess', qrCode: 'EQUIP-005', name: 'Chess Set',
      description: 'Tournament-grade weighted wooden chess set with 32 hand-carved pieces and folding wooden board.',
      imageName: 'Chess.png'
    }
  ].map(item => ({
    ...item, category: 'Board Games', rateType: 'HOURLY', rentalRate: 30,
    latePenalty: 30, pricingProductId: item.id.replace('item_', ''), isForSale: false
  })),
  {
    id: 'item_ps4', qrCode: 'EQUIP-010', name: 'PlayStation 4 Console', category: 'Tech Rentals',
    description: 'PS4 Slim 1TB console bundled with 2 DualShock 4 wireless controllers, HDMI cable, and pre-installed top titles.',
    rateType: 'HOURLY', rentalRate: 250, latePenalty: 250,
    pricingProductId: 'ps4', imageName: 'PS4.png', isForSale: false
  },
  {
    id: 'item_switch', qrCode: 'EQUIP-008', name: 'Nintendo Switch', category: 'Tech Rentals',
    description: 'Nintendo Switch OLED console with Joy-Con controllers, dock, AC adapter, and protective carrying case.',
    rateType: 'HOURLY', rentalRate: 200, latePenalty: 200,
    pricingProductId: 'nintendo-switch', imageName: 'Nintendo_Switch.png', isForSale: false
  },
  {
    id: 'item_ps5', qrCode: 'EQUIP-011', name: 'PlayStation 5 Console', category: 'Tech Rentals',
    description: 'PS5 Disc Edition console with DualSense wireless controller, ultra-high speed SSD, and 4K graphics support.',
    rateType: 'DAILY', rentalRate: 120, latePenalty: 120,
    pricingProductId: 'ps5', imageName: 'PS4.png', isForSale: false
  }
];

export const MOBILE_CATEGORIES = ['Sports', 'Cards', 'Board Games', 'Tech Rentals'];
