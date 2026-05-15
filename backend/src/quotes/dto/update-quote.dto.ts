import { PartialType } from '@nestjs/mapped-types';
import { CreateQuoteDto } from './create-quote.dto';

// PartialType reprend tous les champs en optionnels. Les lignes envoyees
// remplacent integralement la liste existante (cf. service.update). Si on ne
// passe pas "lines", on ne touche pas aux lignes.
export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}
