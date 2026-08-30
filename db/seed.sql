INSERT INTO
    currencies (code, name, symbol, is_active)
VALUES (
        'USD',
        'Dólar Estadounidense',
        '$',
        true
    ),
    (
        'ARS',
        'Peso Argentino',
        '$',
        true
    ),
    (
        'BRL',
        'Real Brasileño',
        'R$',
        true
    )
ON CONFLICT (code) DO NOTHING;

INSERT INTO
    users (
        name,
        surname,
        document_type,
        document_number,
        email,
        country,
        password_hash,
        username,
        alias,
        is_admin,
        kyc_status,
        email_verified_at,
        kyc_reviewed_at
    )
VALUES (
        'Mateo',
        'Benítez',
        'DNI',
        '38492011',
        'mateo.benitez@example.com',
        'AR',
        '$2a$12$eImiTXuWVxfM37uY4JANjOL.81qZq.yS8a23B9Y5j1Zt69/O3G2uG',
        'mateob',
        'mateo.nomapay',
        true,
        'approved',
        NOW(),
        NOW()
    ),
    (
        'Lucía',
        'Gómez',
        'DNI',
        '40123988',
        'lucia.gomez@example.com',
        'AR',
        '$2a$12$eImiTXuWVxfM37uY4JANjOL.81qZq.yS8a23B9Y5j1Zt69/O3G2uG',
        'luciag',
        'lucia.pay',
        false,
        'approved',
        NOW(),
        NOW()
    ),
    (
        'Thiago',
        'Silva',
        'CPF',
        '12345678901',
        'thiago.silva@example.com',
        'BR',
        '$2a$12$eImiTXuWVxfM37uY4JANjOL.81qZq.yS8a23B9Y5j1Zt69/O3G2uG',
        'thiagos',
        'thiago.br',
        false,
        'pending',
        NOW(),
        NULL
    );

INSERT INTO
    wallets (user_id, preferred_currency)
VALUES (3, 'USD'),
    (4, 'ARS'),
    (5, 'BRL');

INSERT INTO
    balances (
        wallet_id,
        currency_code,
        amount
    )
VALUES (4, 'USD', 1250.50000000),
    (4, 'ARS', 450000.00000000),
    (4, 'BRL', 320.00000000),
    (5, 'ARS', 890000.00000000),
    (5, 'USD', 300.00000000),
    (6, 'BRL', 5400.75000000),
    (6, 'USD', 50.00000000);

INSERT INTO
    transactions (
        sender_wallet_id,
        receiver_wallet_id,
        type,
        status,
        currency_origin,
        currency_destination,
        amount,
        fee,
        final_amount,
        exchange_rate
    )
VALUES (
        4,
        5,
        'transfer',
        'completed',
        'USD',
        'USD',
        100.00000000,
        1.50000000,
        98.50000000,
        1.00000000
    ),
    (
        5,
        5,
        'exchange',
        'completed',
        'ARS',
        'USD',
        130000.00000000,
        500.00000000,
        100.00000000,
        1300.00000000
    ),
    (
        4,
        6,
        'transfer',
        'pending',
        'BRL',
        'USD',
        500.00000000,
        10.00000000,
        85.00000000,
        5.76000000
    );

INSERT INTO
    subscriptions (
        user_id,
        plan,
        status,
        started_at,
        expires_at
    )
VALUES (
        3,
        'premium',
        'active',
        NOW() - INTERVAL '30 days',
        NOW() + INTERVAL '335 days'
    ),
    (
        4,
        'free',
        'active',
        NOW() - INTERVAL '10 days',
        NULL
    );



