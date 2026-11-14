# sistema_chamados

## Planejador de plantas — CasaForma

O projeto inclui um planejador visual de plantas residenciais em `public/plantas/`, compatível com a hospedagem atual na Vercel. Depois do deploy, acesse **`/plantas/`** no domínio do projeto.

### Recursos
- Desenho de cômodos retangulares e muros em qualquer direção, com medidas em metros.
- Portas de abrir e de correr, janelas e portões.
- Catálogo de móveis e decoração: geladeira, fogão, pia, mesa, sofá, cama, banheiro, carro, churrasqueira, jardim e mais.
- Visualizações 2D e 3D isométrica, seleção, movimentação, rotação e redimensionamento.
- Fusão de dois cômodos vizinhos alinhados, removendo a parede compartilhada.
- Salvamento automático no navegador, desfazer/refazer e exportação para JSON e PNG.

### Publicar na Vercel
O repositório já contém configuração para Vercel. Faça push das alterações para a branch conectada ao projeto; a Vercel fará um novo deploy automaticamente. A aplicação também pode ser importada em **vercel.com/new** e conectada a este repositório. Como o planejador é estático e salva os dados no navegador, não precisa de configuração de banco de dados.

> Os projetos são armazenados localmente no navegador e não são sincronizados entre dispositivos. Use Exportar para manter uma cópia do arquivo JSON.
